import logging, time, math, random
import pymysql
from pymysql.err import OperationalError
from typing import List, Optional, Iterable, Tuple
import csv, json, os, pathlib
from fastapi import FastAPI, HTTPException, Query
from dotenv import load_dotenv
from google import genai
from google.genai import types


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
def generate_embedding(text: str)-> List[float]:
    logger.debug(f"Generating embedding for: {text}")
    client = genai.Client()
    result = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768)
    )
    return result.embeddings[0].values

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
    result = generate_embedding(text)
    return result

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
        VALUES (%s, NULL, %s, %s)
        ON DUPLICATE KEY UPDATE
          aliases = VALUES(aliases),
          embedding = VALUES(embedding)
    """

    # figure out where to start
    offset = (
        start_index if start_index is not None
        else (read_checkpoint() if use_checkpoint else 0)
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
            emb = generate_embedding_alias(name, aliases_json)
            emb_str = json.dumps(emb)
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
                    write_checkpoint(global_end_excl)
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
def seed_people(n: int = Query(default=4, ge=1, le=50, description="How many synthetic rows to insert")):
    """
    Inserts a few synthetic rows into `people` and generates resume embeddings.
    Requires a MySQL table `people` with a VECTOR(768) column `resume_embedding`.
    """
    # --- tiny synthetic pool; we’ll sample up to n ---
    seed_pool = [
        {
            "name": "Maya",
            "from_role": "Customer Support Rep",
            "to_role": "QA Engineer",
            "time_to_offer": "3 months",
            "pay_from": 42000, "pay_to": 52000, "currency": "USD",
            "note": "Bootcamp + internal project",
            "sources": [{"label": "Portfolio"}],
            "resume_summary": "Handled tickets, wrote macros, built basic Cypress tests for support tools. Learned JS and testing frameworks."
        },
        {
            "name": "Leo",
            "from_role": "Data Analyst",
            "to_role": "Product Manager",
            "time_to_offer": "5 months",
            "pay_from": 68000, "pay_to": 88000, "currency": "USD",
            "note": "Shadow PM + case deck",
            "sources": [{"label": "Case study"}],
            "resume_summary": "Built dashboards, A/B test reads, PRDs for minor features; coordinated with eng and design on small launches."
        },
        {
            "name": "Hana",
            "from_role": "Graphic Designer",
            "to_role": "UX Designer",
            "time_to_offer": "4 months",
            "pay_from": 3500, "pay_to": 5200, "currency": "SGD",
            "note": "Portfolio revamp + referrals",
            "sources": [{"label": "Dribbble"}],
            "resume_summary": "Brand work, marketing visuals, moved into wireframes, Figma prototypes, usability tests for landing pages."
        },
        {
            "name": "Arjun",
            "from_role": "Ops Associate",
            "to_role": "Data Engineer",
            "time_to_offer": "6 months",
            "pay_from": 54000, "pay_to": 78000, "currency": "USD",
            "note": "SQL + pipelines",
            "sources": [{"label": "GitHub"}],
            "resume_summary": "Automated reports with SQL/Python, built ELT scripts, scheduled jobs; strong grasp of schemas and data quality."
        },
        {
            "name": "Sara",
            "from_role": "Teacher",
            "to_role": "Instructional Designer",
            "time_to_offer": "3 months",
            "pay_from": 48000, "pay_to": 62000, "currency": "USD",
            "note": "Sample modules",
            "sources": [{"label": "Portfolio"}],
            "resume_summary": "Curriculum planning, learning objectives, authored interactive modules, assessments, LMS administration."
        },
    ]

    if n > len(seed_pool):
        n = len(seed_pool)
    rows = seed_pool[:n]

    # Build executemany payload
    sql = """
        INSERT INTO people
            (name, from_role, to_role, time_to_offer, pay_from, pay_to, currency, note, sources, resume_summary, resume_embedding)
        VALUES
            (%s,   %s,        %s,      %s,            %s,       %s,      %s,       %s,   %s,      %s,              CAST(%s AS VECTOR(768)))
    """

    payload = []
    for r in rows:
        # Create a compact text to embed (you can change this weighting as you like)
        text = f"{r['resume_summary']} | From: {r['from_role']} | To: {r['to_role']}"
        emb = generate_embedding(text)                 # -> List[float] len 768
        emb_json = json.dumps(emb)                     # MySQL CAST-from-JSON pattern

        payload.append((
            r["name"],
            r["from_role"],
            r["to_role"],
            r["time_to_offer"],
            r["pay_from"],
            r["pay_to"],
            r["currency"],
            r["note"],
            json.dumps(r.get("sources") or []),
            r["resume_summary"],
            emb_json,
        ))

    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.executemany(sql, payload)
            affected = cur.rowcount
        conn.commit()
        return {"inserted": affected, "requested": n}
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        logger.exception("Seeding people failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.get("/healthz")
def healthz():
    logger.debug("Health check requested")
    return {"ok": True}
