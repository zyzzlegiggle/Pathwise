# main.py
import csv, json, os, pathlib
from typing import List, Optional
from fastapi import FastAPI, HTTPException
import pymysql
from dotenv import load_dotenv
from typing import Optional, List
import json
from google import genai
from google.genai import types

load_dotenv()  # optional; read .env for DB settings

app = FastAPI(title="Skills CSV → TiDB importer")

# ---- Configuration ----
CSV_PATH = os.getenv("CSV_PATH", "data/skills.csv")  # e.g., ./data/skills.csv
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "4000"))          # TiDB default 4000
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "mydb")               # change to your DB
CA_PATH = os.getenv("CA_PATH")

# ---- DB helper ----
def get_conn():
    # TiDB speaks MySQL protocol; PyMySQL works fine
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        autocommit=False,                # we’ll control commits
        cursorclass=pymysql.cursors.Cursor,
        charset="utf8mb4",
        ssl_verify_cert=True,
        ssl_verify_identity=True,
        ssl_ca=CA_PATH
    )

# ---- CSV → rows ----
def read_skills_from_csv(csv_path: str) -> List[tuple]:
    """
    Returns list of tuples (name, aliases_json) ready for INSERT.
    - Skips header row.
    - Skips rows where name is empty.
    - Splits altLabels by '|' and trims; stores as JSON array or NULL if none.
    """
    rows: List[tuple] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for line in reader:
            # Be defensive about column count
            name = (line[0].strip() if len(line) > 0 and line[0] else "")
            alts_raw = (line[1].strip() if len(line) > 1 and line[1] else "")

            if not name:
                continue  # skip empty skill names

            # Split "a | b | c" into ["a","b","c"], drop empties/dupes, drop items equal to name
            if alts_raw:
                parts = [p.strip() for p in alts_raw.split("|")]
                uniq = []
                seen = set()
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
    return rows

# ---- Insert ----
def insert_skills(rows: List[tuple]) -> dict:
    """
    Inserts rows into skill_node.
    Expects tuples (name, aliases_json or None).
    Leaves parent_id and embedding as NULL.
    """
    if not rows:
        return {"inserted": 0, "skipped": 0}

    sql = """
        INSERT INTO skill_node (name, parent_id, aliases, embedding)
        VALUES (%s, NULL, %s, NULL)
    """
    inserted = 0
    skipped = 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # executemany is fine, but we need to pass JSON correctly.
            # PyMySQL will send strings; TiDB will parse JSON if column type is JSON.
            data = []
            for name, aliases_json in rows:
                data.append((name, aliases_json))
            cur.executemany(sql, data)
            inserted = cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"inserted": inserted, "skipped": skipped}

# ---- API ----
@app.post("/import-skills")
def import_skills():
    path = pathlib.Path(CSV_PATH)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"CSV file not found: {path}")

    try:
        rows = read_skills_from_csv(str(path))
        result = insert_skills(rows)
        return {
            "csv_path": str(path),
            "rows_read": len(rows),
            "inserted": result["inserted"],
            "skipped_empty_names": 0,   # tracked implicitly in read_skills_from_csv
            "message": "Done."
        }
    except Exception as e:
        # Keep it simple for demo purposes
        raise HTTPException(status_code=500, detail=str(e))


def generate_embedding(name: str, aliases_json: Optional[str]) -> List[float]:
    """
    Generate embedding using Gemini (or other model).
    Concatenates name + aliases into one text string.
    Replace this stub with actual Gemini API call.
    """
    text_parts = [name]
    if aliases_json:
        try:
            aliases = json.loads(aliases_json)
            if isinstance(aliases, list):
                text_parts.extend(aliases)
        except Exception:
            pass
    text = " | ".join(text_parts)
    
    client = genai.Client()

    result = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768)
    )

    return result.embeddings


# --- Update insert function ---
def insert_skills(rows: List[tuple]) -> dict:
    """
    Inserts rows into skill_node.
    Each row: (name, aliases_json or None).
    """
    if not rows:
        return {"inserted": 0, "skipped": 0}

    sql = """
        INSERT INTO skill_node (name, parent_id, aliases, embedding)
        VALUES (%s, NULL, %s, %s)
    """
    inserted = 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            data = []
            for name, aliases_json in rows:
                emb = generate_embedding(name, aliases_json)
                emb_str = "[" + ",".join(str(x) for x in emb) + "]"  # TiDB VECTOR expects array literal
                data.append((name, aliases_json, emb_str))
            cur.executemany(sql, data)
            inserted = cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"inserted": inserted}



# Optional health check
@app.get("/healthz")
def healthz():
    return {"ok": True}
