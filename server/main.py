# used for seeding db
import logging, time, math, random
import pymysql
from pymysql.err import OperationalError
from typing import List, Optional, Iterable, Tuple
import csv, json, os, pathlib
from fastapi import FastAPI, HTTPException, Query
from dotenv import load_dotenv
from google import genai
from google.genai import types
import pandas as pd
from sentence_transformers import SentenceTransformer
import numpy as np



# ---- Logging setup ----
logging.basicConfig(
    level=logging.DEBUG,   # change to DEBUG for more verbosity
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("skills_import")

load_dotenv()

app = FastAPI(title="Server")

# ---- Configuration ----
CSV_PATH = os.getenv("CSV_PATH", "data/skills.csv")  # e.g., ./data/skills.csv
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "4000"))          # TiDB default 4000
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "mydb")               # change to your DB
CA_PATH = os.getenv("OS_PATH", "")
CHECKPOINT_PATH = os.getenv("CHECKPOINT_PATH", "skills_import.state")

from google.cloud import storage

CHECKPOINT_BUCKET = os.getenv("CHECKPOINT_BUCKET", "")
CHECKPOINT_BLOB = os.getenv("CHECKPOINT_BLOB", "skills_import.state")

storage_client = storage.Client()

# checkpoint for bucket
def read_checkpoint() -> int:
    if not CHECKPOINT_BUCKET:
        return 0
    try:
        bucket = storage_client.bucket(CHECKPOINT_BUCKET)
        blob = bucket.blob(CHECKPOINT_BLOB)
        if not blob.exists():
            return 0
        data = blob.download_as_text(encoding="utf-8").strip()
        return int(data)
    except Exception as e:
        logger.warning(f"Failed to read checkpoint from GCS: {e}")
        return 0

def write_checkpoint(n: int) -> None:
    if not CHECKPOINT_BUCKET:
        return
    try:
        bucket = storage_client.bucket(CHECKPOINT_BUCKET)
        blob = bucket.blob(CHECKPOINT_BLOB)
        blob.upload_from_string(str(n), content_type="text/plain")
        logger.debug(f"Wrote checkpoint {n} to gs://{CHECKPOINT_BUCKET}/{CHECKPOINT_BLOB}")
    except Exception as e:
        logger.error(f"Failed to write checkpoint to GCS: {e}")

#checkpoint for file

PEOPLE_CHECKPOINT_PATH = os.getenv("PEOPLE_CHECKPOINT_PATH", "./seed_people.state")

SKILLS_CHECKPOINT_PATH = os.getenv("SKILLS_CHECKPOINT_PATH", "./skills_import.state")

def read_skills_checkpoint() -> int:
    try:
        if not os.path.exists(SKILLS_CHECKPOINT_PATH):
            return 0
        with open(SKILLS_CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            data = f.read().strip()
            return int(data) if data else 0
    except Exception as e:
        logger.warning(f"Failed to read skills checkpoint: {e}")
        return 0

def write_skills_checkpoint(n: int) -> None:
    try:
        with open(SKILLS_CHECKPOINT_PATH, "w", encoding="utf-8") as f:
            f.write(str(n))
        logger.debug(f"Wrote skills checkpoint at row index {n}")
    except Exception as e:
        logger.error(f"Failed to write skills checkpoint: {e}")

def read_people_checkpoint() -> int:
    try:
        if not os.path.exists(PEOPLE_CHECKPOINT_PATH):
            return 0
        with open(PEOPLE_CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            data = f.read().strip()
            return int(data) if data else 0
    except Exception as e:
        logger.warning(f"Failed to read people checkpoint: {e}")
        return 0

def write_people_checkpoint(n: int) -> None:
    try:
        with open(PEOPLE_CHECKPOINT_PATH, "w", encoding="utf-8") as f:
            f.write(str(n))
        logger.debug(f"Wrote people checkpoint at row index {n}")
    except Exception as e:
        logger.error(f"Failed to write people checkpoint: {e}")
# ---------- DB connection with timeouts ----------
def get_conn():
    logger.debug(f"Connecting to DB {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        autocommit=False,
        cursorclass=pymysql.cursors.Cursor,
        ssl_verify_cert=True,
        ssl_verify_identity=True,
        ssl_ca=CA_PATH,
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=60,
        write_timeout=60,
    )
    with conn.cursor() as cur:
        cur.execute("SET SESSION wait_timeout = 28800")  # 8 hours
    logger.debug("DB connection established")
    return conn

# ---------- utilities ----------
def chunked(seq: List[Tuple[str, Optional[str]]], size: int) -> Iterable[List[Tuple[str, Optional[str]]]]:
    for i in range(0, len(seq), size):
        yield seq[i:i+size]

def is_transient_mysql_err(e: Exception) -> bool:
    if not isinstance(e, OperationalError):
        return False
    code = e.args[0] if e.args else None
    return code in (2006, 2013)

# ---------- embedding ----------
def generate_embedding_384(text: str) -> List[float]:
    # Reuse the local SentenceTransformer you already set up
    return embed_texts_local([text], batch_size=1)[0]  # 384 floats

def generate_embedding_alias(name: str, aliases_json: Optional[str]) -> List[float]:
    text_parts = [name]
    if aliases_json:
        try:
            al = json.loads(aliases_json)
            if isinstance(al, list):
                text_parts.extend(al)
        except Exception as ex:
            logger.warning(f"Failed to parse aliases for {name}: {ex}")
    text = " | ".join(text_parts)
    return generate_embedding_384(text)
# ---------- robust batch insert with retries ----------
def insert_skills(
    rows: List[tuple],
    batch_size: int = 50,
    max_retries: int = 5,
    start_index: Optional[int] = None,
    use_checkpoint: bool = True,
) -> dict:
    total = len(rows)
    if total == 0:
        logger.info("No rows to insert.")
        return {"inserted": 0, "batches": 0}

    # upsert SQL (see section above)
    sql = """
        INSERT INTO skill_node (name, parent_id, aliases, embedding)
        VALUES (%s, NULL, %s, CAST(%s AS VECTOR(384)))
        ON DUPLICATE KEY UPDATE
        aliases = VALUES(aliases),
        embedding = VALUES(embedding)
    """
    
    # figure out where to start
    offset = (
        start_index if start_index is not None
        else (read_skills_checkpoint() if use_checkpoint else 0)
    )
    if offset < 0 or offset > total:
        offset = 0
    if offset:
        logger.info(f"Resuming from row index {offset} (0-based)")

    # slice the worklist
    rows_to_process = rows[offset:]
    if not rows_to_process:
        logger.info("Nothing to do from the given starting point.")
        return {"inserted": 0, "batches": 0, "start_index": offset}

    inserted_total = 0
    batch_index = 0
    t0 = time.time()
    logger.info(f"Starting insert of {len(rows_to_process)} rows in batches of {batch_size}")
 

    for batch in chunked(rows_to_process, batch_size):
        batch_index += 1
        global_start = offset + (batch_index - 1) * batch_size
        global_end_excl = global_start + len(batch)
        logger.info(f"Preparing batch {batch_index} for rows [{global_start}:{global_end_excl}) ...")

        # Precompute embeddings
        t_emb0 = time.time()
        payload = []
        for name, aliases_json in batch:
            emb = generate_embedding_alias(name, aliases_json)   # 384-D list[float]
            emb_str = json.dumps(emb)                            # JSON array string
            payload.append((name, aliases_json, emb_str))
        t_emb1 = time.time()
        logger.debug(f"Batch {batch_index} embeddings computed in {t_emb1 - t_emb0:.2f}s")

        # Insert with retry
        attempt = 0
        while True:
            attempt += 1
            conn = None
            try:
                conn = get_conn()
                conn.ping(reconnect=True)
                with conn.cursor() as cur:
                    cur.executemany(sql, payload)
                    affected = cur.rowcount
                conn.commit()
                if conn:
                    conn.close()

                inserted_total += affected
                logger.info(
                    f"✅ Batch {batch_index}: upserted {affected}/{len(batch)} rows "
                    f"(progress rows [{global_start}:{global_end_excl}), total upserts so far {inserted_total})"
                )

                # ✅ update checkpoint AFTER successful commit
                if use_checkpoint:
                    write_skills_checkpoint(global_end_excl)
                    logger.debug(f"Wrote checkpoint at row index {global_end_excl}")
                break

            except Exception as e:
                # best-effort cleanup
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except Exception:
                        pass

                if is_transient_mysql_err(e) and attempt <= max_retries:
                    backoff = min(60, (2 ** (attempt - 1))) + random.random()
                    logger.warning(
                        f"Batch {batch_index}: transient DB error (attempt {attempt}/{max_retries}): {e}. "
                        f"Retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                    continue
                else:
                    logger.error(f"❌ Batch {batch_index}: failed permanently after {attempt} attempts: {e}")
                    raise

    logger.info(
        f"All done. Upserted {inserted_total} rows in {time.time() - t0:.2f}s across {batch_index} batches."
    )
    return {
        "inserted": inserted_total,
        "batches": batch_index,
        "start_index": offset,
        "end_index": offset + len(rows_to_process),
    }

def read_skills_from_csv(csv_path: str) -> List[tuple]:
    logger.info(f"Reading CSV from {csv_path} ...")
    rows: List[tuple] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        logger.debug(f"CSV header: {header}")
        for line in reader:
            name = (line[0].strip() if len(line) > 0 and line[0] else "")
            alts_raw = (line[1].strip() if len(line) > 1 and line[1] else "")
            if not name:
                logger.debug("Skipping empty skill row")
                continue

            if alts_raw:
                parts = [p.strip() for p in alts_raw.split("|")]
                uniq, seen = [], set()
                for p in parts:
                    if not p or p.lower() == name.lower():
                        continue
                    if p.lower() not in seen:
                        seen.add(p.lower())
                        uniq.append(p)
                aliases_json: Optional[str] = json.dumps(uniq) if uniq else None
            else:
                aliases_json = None
            rows.append((name, aliases_json))
    logger.info(f"Read {len(rows)} valid skill rows from CSV")
    return rows


import math
import pandas as pd
import numpy as np

def _clean_scalar(x):
    # Treat pandas/NumPy NaNs/Infs as None
    try:
        if x is None:
            return None
        # pandas-friendly check
        if isinstance(x, (float, np.floating)) and (math.isnan(x) or math.isinf(x)):
            return None
        # pandas NA types
        if pd.isna(x):
            return None
    except Exception:
        pass
    return x

_EMBED_MODEL = None

def get_local_embedder() -> SentenceTransformer:
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        # Small, fast, 384-D, good cosine performance
        _EMBED_MODEL = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _EMBED_MODEL

def embed_texts_local(texts: List[str], batch_size: int = 64) -> List[List[float]]:
    model = get_local_embedder()
    # normalize_embeddings=True -> better cosine search behavior
    embs = model.encode(
        texts,
        batch_size=batch_size,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [row.astype(np.float32).tolist() for row in embs]

def _as_int(x) -> Optional[int]:
    try:
        if x is None: 
            return None
        s = str(x).strip().replace(",", "")
        if s.endswith("+"):
            s = s[:-1]
        return int(s)
    except Exception:
        return None


def is_nanlike(x) -> bool:
    # catches pandas NA, numpy nan, None, and infs
    if x is None:
        return False  # None is fine (maps to SQL NULL)
    try:
        # pandas NA
        if pd.isna(x):
            return True
    except Exception:
        pass
    # numpy/pure-float NaN/Inf
    if isinstance(x, float):
        return math.isnan(x) or math.isinf(x)
    if isinstance(x, (np.floating,)):
        return np.isnan(x) or np.isinf(x)
    return False

def none_if_nan(x):
    return None if is_nanlike(x) else x

def deep_clean(obj):
    """
    Recursively replace NaN/Inf with None in dicts/lists/tuples.
    Also stringifies numpy scalars.
    """
    if obj is None:
        return None
    # primitives
    if isinstance(obj, (str, int, bool)):
        return obj
    if isinstance(obj, float) or isinstance(obj, (np.floating,)):
        return None if is_nanlike(obj) else float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    # containers
    if isinstance(obj, dict):
        return {str(k): deep_clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [deep_clean(v) for v in obj]
    # anything else -> try best effort
    try:
        return None if is_nanlike(obj) else obj
    except Exception:
        return None

def safe_json_or_none(x) -> str | None:
    """
    Returns a JSON string with no NaN/Inf (replaced by null),
    or None if x is null-ish.
    """
    if x is None:
        return None
    cleaned = deep_clean(x)
    try:
        # ensure_ascii False preserves unicode; allow_nan False forbids NaN/Inf
        return json.dumps(cleaned, ensure_ascii=False, allow_nan=False)
    except Exception:
        # as a last resort, return None so DB gets NULL
        return None


def _as_bool_from_yes(x) -> Optional[int]:
    if x is None:
        return None
    s = str(x).strip().lower()
    if s in ("yes", "y", "true", "1"):
        return 1
    if s in ("no", "n", "false", "0"):
        return 0
    return None

def _jsonable(obj) -> Optional[str]:
    if obj is None:
        return None
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return None

def compose_profile_text(rec: dict) -> str:
    """
    Build a compact, high-signal summary for embedding.
    Pulls from About, Experiences, Skills, Education, etc.
    """
    parts = []
    name = rec.get("Full Name") or rec.get("Intro", {}).get("Full Name")
    if name:
        parts.append(f"Name: {name}")

    title = rec.get("Workplace") or rec.get("Intro", {}).get("Workplace")
    if title:
        parts.append(f"Workplace: {title}")

    about = rec.get("About")
    if about:
        parts.append(f"About: {about}")

    # ---- Experiences ----
    exps = rec.get("Experiences")
    if isinstance(exps, dict):
        for k in sorted(exps.keys(), key=lambda z: str(z)):
            item = exps.get(k)
            if isinstance(item, dict):
                wp = item.get("Workplace") or ""
                role = item.get("Role") or ""
                desc = item.get("Description") or ""
                seg = " | ".join([t for t in [role, wp, desc] if t])
            else:
                # If it's a plain string, just append directly
                seg = str(item).strip()
            if seg:
                parts.append(f"Experience: {seg}")

    # ---- Skills ----
    skills = rec.get("Skills")
    if isinstance(skills, dict):
        sk_list = [skills[k] for k in sorted(skills.keys(), key=lambda z: str(z)) if skills.get(k)]
        if sk_list:
            parts.append("Skills: " + ", ".join(sk_list))

    # ---- Educations ----
    edus = rec.get("Educations")
    if isinstance(edus, dict):
        for k in sorted(edus.keys(), key=lambda z: str(z)):
            e = edus.get(k)
            if isinstance(e, dict):
                deg = e.get("Degree") or ""
                inst = e.get("Institute") or ""
                dur = e.get("Duration") or ""
                seg = " | ".join([t for t in [deg, inst, dur] if t])
            else:
                seg = str(e).strip()
            if seg:
                parts.append(f"Education: {seg}")

    # ---- Publications ----
    pubs = rec.get("Publications")
    if isinstance(pubs, dict):
        for k in sorted(pubs.keys(), key=lambda z: str(z)):
            p = pubs.get(k)
            if isinstance(p, dict):
                title = p.get("Title") or ""
                j = p.get("Journal") or ""
                seg = f"{title} {j}".strip()
            else:
                seg = str(p).strip()
            if seg:
                parts.append(f"Publication: {seg}")

    return "\n".join(parts)


# ---- API ----
@app.post("/import-skills")
def import_skills(
    resume: bool = Query(default=True, description="Resume from checkpoint"),
    start_from: Optional[int] = Query(default=None, description="0-based row index to start from (overrides resume)")
):
    path = pathlib.Path(CSV_PATH)
    logger.info(f"Received request to import skills from {path}")
    if not path.exists():
        logger.error(f"CSV file not found: {path}")
        raise HTTPException(status_code=404, detail=f"CSV file not found: {path}")

    try:
        rows = read_skills_from_csv(str(path))
        result = insert_skills(
            rows,
            batch_size=50,
            max_retries=5,
            start_index=start_from,
            use_checkpoint=resume and (start_from is None),
        )
        logger.info("Import complete")
        return {
            "csv_path": str(path),
            "rows_read": len(rows),
            "inserted": result["inserted"],
            "start_index": result.get("start_index"),
            "end_index": result.get("end_index"),
            "message": "Done."
        }
    except Exception as e:
        logger.exception("Import failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/seed-people")
def seed_people(
    path: str = Query(default="./data/LinkedIn_Dataset.pcl", description="Path to the pickle dataset"),
    limit: Optional[int] = Query(default=None, ge=1, description="Optional cap on rows to import"),
    batch_size: int = Query(default=100, ge=1, le=1000, description="DB batch size"),
    resume: bool = Query(default=True, description="Resume from checkpoint"),
    start_from: Optional[int] = Query(default=None, description="0-based row index to start from (overrides resume)"),
):
    logger.info(f"🚀 Starting seed_people run with dataset={path}, limit={limit}, batch_size={batch_size}, resume={resume}, start_from={start_from}")

    # ---- Load dataset ----
    try:
        df = pd.read_pickle(path)
        logger.info(f"✅ Loaded dataset from {path}, shape={df.shape}, columns={list(df.columns)[:10]}")
    except Exception as e:
        logger.exception("❌ Failed to read pickle dataset")
        raise HTTPException(status_code=400, detail=f"Failed to read pickle: {e}")

    # Convert rows into list of dicts
    records = df.to_dict(orient="records")

    if limit is not None:
        logger.info(f"Applying row limit={limit}")
        records = records[:limit]

    total_records = len(records)
    if not records:
        logger.warning("⚠️ No records found in dataset after parsing")
        return {"inserted": 0, "requested": 0, "message": "No records found in dataset."}
    logger.info(f"📊 Parsed total valid records={total_records}")

    # ---- Resume logic ----
    offset = (
        start_from if start_from is not None
        else (read_people_checkpoint() if resume else 0)
    )
    if offset < 0 or offset > total_records:
        logger.warning(f"⚠️ Invalid offset {offset}, resetting to 0")
        offset = 0
    if offset:
        logger.info(f"🔄 Resuming from row index {offset} (0-based)")
    else:
        logger.info("▶️ Starting from beginning (offset=0)")

    records = records[offset:]
    if not records:
        logger.info(f"Nothing left to do from checkpoint {offset}")
        return {"inserted": 0, "requested": 0, "message": f"Nothing to do from checkpoint {offset}"}

    # ---- Build embedding texts ----
    texts = []
    payload_rows = []
    for i, rec in enumerate(records, start=offset):
        text = compose_profile_text(rec)
        if not text:
            text = f"{rec.get('Full Name') or ''} | {rec.get('Workplace') or ''} | {rec.get('Location') or ''}"
        texts.append(text)
        payload_rows.append(rec)
        if (i - offset + 1) % 500 == 0:
            logger.debug(f"📝 Prepared {i - offset + 1} records for embedding...")

    # ---- Embeddings ----
    logger.info(f"🧠 Generating embeddings for {len(texts)} profiles with local model...")
    t0 = time.time()
    embeddings = embed_texts_local(texts, batch_size=128)
    logger.info(f"✅ Embeddings generated in {time.time() - t0:.2f}s")

    # ---- Build executemany payload ----
    sql = """ INSERT INTO people
        (full_name, current_title, workplace, location, connections, followers, photo, about,
        experiences, educations, licenses, volunteering, skills, recommendations, projects,
        publications, courses, honors, scores, languages, organizations, interests, activities,
        label, sources, resume_summary, resume_embedding)
        VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s, %s, %s,
        %s, %s, %s, CAST(%s AS VECTOR(384))) 
    """

    exec_rows = []

    for rec, emb in zip(payload_rows, embeddings):
        # clean this record once
        rec = {k: deep_clean(v) for k, v in rec.items()}
        intro = rec.get("Intro") or {}

        full_name = (rec.get("Full Name") or intro.get("Full Name") or "") or ""
        current_title = None  # TODO: derive if you want (e.g., from current exp)
        workplace     = none_if_nan(rec.get("Workplace") or intro.get("Workplace"))
        location      = none_if_nan(rec.get("Location")  or intro.get("Location"))

        connections = _as_int(rec.get("Connections") or intro.get("Connections"))
        followers   = _as_int(rec.get("Followers")   or intro.get("Followers"))
        photo       = _as_bool_from_yes(rec.get("Photo") or intro.get("Photo"))
        about       = none_if_nan(rec.get("About"))

        # JSON columns (serialize to valid JSON or None)
        experiences     = safe_json_or_none(rec.get("Experiences"))
        educations      = safe_json_or_none(rec.get("Educations"))
        licenses        = safe_json_or_none(rec.get("Licenses"))
        volunteering    = safe_json_or_none(rec.get("Volunteering"))
        skills          = safe_json_or_none(rec.get("Skills"))
        recommendations = safe_json_or_none(rec.get("Recommendations"))
        projects        = safe_json_or_none(rec.get("Projects"))
        publications    = safe_json_or_none(rec.get("Publications"))
        courses         = safe_json_or_none(rec.get("Courses"))
        honors          = safe_json_or_none(rec.get("Honors"))
        scores          = safe_json_or_none(rec.get("Scores"))
        languages       = safe_json_or_none(rec.get("Languages"))
        organizations   = safe_json_or_none(rec.get("Organizations"))
        interests       = safe_json_or_none(rec.get("Interests"))
        activities      = safe_json_or_none(rec.get("Activities"))
        sources_json    = safe_json_or_none(rec.get("sources"))

        label = _as_int(rec.get("Label"))

        exec_rows.append((
            full_name,
            current_title,
            workplace,
            location,
            connections,
            followers,
            photo,
            about,

            experiences,
            educations,
            licenses,
            volunteering,
            skills,
            recommendations,
            projects,
            publications,
            courses,
            honors,
            scores,
            languages,
            organizations,
            interests,
            activities,

            label,
            sources_json,
            None,              # resume_summary (set one if you generate it)
            json.dumps(emb),   # embedding as JSON array string for CAST(... AS VECTOR(384))
        ))

    # ---- Insert with checkpoint updates ----
    total = 0
    start_offset = offset
    for batch_idx, batch in enumerate(chunked(exec_rows, batch_size), start=1):
        global_start = start_offset + (batch_idx - 1) * batch_size
        global_end_excl = global_start + len(batch)
        logger.info(f"📥 Processing batch {batch_idx}: rows {global_start}:{global_end_excl}")

        attempt = 0
        while True:
            attempt += 1
            conn = None
            try:
                conn = get_conn()
                with conn.cursor() as cur:
                    cur.executemany(sql, batch)
                    affected = cur.rowcount
                conn.commit()
                if conn:
                    conn.close()
                total += affected
                logger.info(f"✅ Batch {batch_idx} committed: {affected}/{len(batch)} rows, running total={total}")
                write_people_checkpoint(global_end_excl)
                logger.debug(f"💾 Updated checkpoint to {global_end_excl}")
                break
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except Exception:
                        pass
                if is_transient_mysql_err(e) and attempt <= 5:
                    backoff = min(60, (2 ** (attempt - 1))) + random.random()
                    logger.warning(f"⏳ Batch {batch_idx} transient DB error ({e}), retry {attempt}/5 in {backoff:.1f}s...")
                    time.sleep(backoff)
                    continue
                logger.exception(f"❌ Batch {batch_idx} failed permanently after {attempt} attempts: {e}")
                raise HTTPException(status_code=500, detail=f"DB error: {e}")

    logger.info(f"🎉 Finished seeding {total} rows (requested={len(records)}). Final checkpoint={start_offset + len(records)}")
    return {
        "inserted_or_updated": int(total),
        "requested": len(records),
        "start_index": start_offset,
        "end_index": start_offset + len(records),
        "message": "Done with checkpointing."
    }

@app.get("/healthz")
def healthz():
    logger.debug("Health check requested")
    return {"ok": True}
