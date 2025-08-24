import os
import re
import math
import json
from typing import List, Optional, Dict, Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, Query
from pydantic import BaseModel, HttpUrl
from sqlalchemy import create_engine, text

from google import genai

# --- ENV (set these in your .env or process) ---
DATABASE_URL="mysql://3Ps9xjkmD5rhuGN.root:wHoIhPXEOcaknUA5@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict"
TIDB_HOST = "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
TIDB_PORT = 4000
TIDB_USER = "3Ps9xjkmD5rhuGN.root"
TIDB_PASSWORD ="wHoIhPXEOcaknUA5"
TIDB_DB = "test"
# Gemini Embeddings
GEMINI_API_KEY = "AIzaSyBw5LtEThyg9evuKJb_iTtTVyUj8EeUVDs"
GEMINI_EMBED_MODEL = "gemini-embedding-001"

# --- DB engine (sync for simplicity/robustness) ---
engine = create_engine(
    f"mysql+pymysql://{TIDB_USER}:{TIDB_PASSWORD}@{TIDB_HOST}:{TIDB_PORT}/{TIDB_DB}?ssl_ca=./isrgrootx1.pem&ssl_verify_cert=true&ssl_verify_identity=true",
    pool_pre_ping=True,
)

app = FastAPI(title="Resource Seeder (edX + Coursera)")

# ---------- Utilities ----------

async def gemini_embed(texts: List[str]) -> List[List[float]]:
    """
    Calls Gemini embeddings API. Returns a vector per input text (len 768 default for text-embedding-004).
    """
    
    client = genai.Client()

    if not texts:
        return []

    out = []
    result = client.models.embed_content(
        model=GEMINI_EMBED_MODEL,
        contents= texts
    )

    for embedding in result.embeddings:
        out.append(embedding)

    return out

def parse_hours_from_text(s: str) -> Optional[float]:
    if not s:
        return None
    s = s.lower()
    # Try patterns like "6–8 weeks", "10 hours", "approx. 12h", "PT2H30M"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(hours|hour|hrs|h)\b", s)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(weeks|week)\b", s)
    if m:
        return float(m.group(1)) * 6.0  # rough 6h/week default
    # ISO 8601 duration (YouTube/Some schemas) e.g., PT5H30M
    iso = re.search(r"P(T(?:(\d+)H)?(?:(\d+)M)?)", s)
    if iso:
        h = float(iso.group(2) or 0)
        m = float(iso.group(3) or 0)
        return h + (m / 60.0) if (h or m) else None
    return None

def upsert_resource(row: Dict[str, Any], embedding_vec: Optional[List[float]]):
    """
    Inserts resource; then updates embedding with CAST(? AS VECTOR).
    Expects row keys: title, provider, url, hours_estimate, cost, skill_targets, description
    """
    with engine.begin() as conn:
        ins = text("""
            INSERT INTO resources (title, provider, url, hours_estimate, cost, skill_targets, description)
            VALUES (:title, :provider, :url, :hours_estimate, :cost, :skill_targets, :description)
        """)
        conn.execute(ins, {
            "title": row.get("title")[:255] if row.get("title") else None,
            "provider": row.get("provider")[:128] if row.get("provider") else None,
            "url": row.get("url"),
            "hours_estimate": row.get("hours_estimate"),
            "cost": row.get("cost", 0),
            "skill_targets": json.dumps(row.get("skill_targets", [])),
            "description": row.get("description"),
        })
        # fetch last id
        rid = conn.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        if embedding_vec:
            conn.execute(
                text("UPDATE resources SET embedding = CAST(:vec AS VECTOR) WHERE resource_id = :rid"),
                {"vec": json.dumps(embedding_vec), "rid": rid},
            )

# ---------- Skill targeting (simple keyword match from skills_catalog) ----------

def load_skill_terms() -> List[Dict[str, Any]]:
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT skill_name, aliases FROM skills_catalog")).mappings().all()
    out = []
    for r in rows:
        name = r["skill_name"]
        aliases = []
        try:
            aliases = json.loads(r["aliases"]) if r["aliases"] else []
        except Exception:
            pass
        terms = [name] + [a for a in aliases if isinstance(a, str)]
        out.append({"name": name, "terms": list({t.lower() for t in terms})})
    return out

def infer_skill_targets(title: str, desc: str, skill_terms: List[Dict[str, Any]]) -> List[str]:
    blob = f"{title}\n{desc}".lower()
    hits = []
    for s in skill_terms:
        if any(t in blob for t in s["terms"]):
            hits.append(s["name"])
    return hits[:12]  # cap

SKILL_TERMS_CACHE = None

# ---------- edX Discovery: https://www.edx.org/api/catalog/v1/courses/ ----------

class SeedOut(BaseModel):
    inserted: int

@app.get("/seed/edx", response_model=SeedOut)
async def seed_edx(limit: int = Query(50, ge=1, le=500)):
    """
    Pulls edX Discovery (public) and inserts top-N courses.
    """
    global SKILL_TERMS_CACHE
    if SKILL_TERMS_CACHE is None:
        SKILL_TERMS_CACHE = load_skill_terms()

    base = "https://www.edx.org/api/catalog/v1/courses/"
    inserted = 0
    page = 1
    got = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while got < limit:
            r = await client.get(base, params={"page": page})
            r.raise_for_status()
            data = r.json()
            results = data.get("results", [])
            if not results:
                break
            for c in results:
                if got >= limit:
                    break
                title = c.get("title")
                url = c.get("marketing_url") or c.get("url") or ""
                desc = c.get("short_description") or c.get("full_description") or ""
                effort = c.get("effort") or ""  # e.g., "5-7 hours per week"
                hours = parse_hours_from_text(effort) or parse_hours_from_text(desc) or 8.0
                row = {
                    "title": title,
                    "provider": "edX",
                    "url": url,
                    "hours_estimate": round(float(hours), 1),
                    "cost": 0.0,
                    "skill_targets": infer_skill_targets(title or "", desc or "", SKILL_TERMS_CACHE),
                    "description": desc[:12000] if desc else None,
                }
                # embed title + short description
                vec = (await gemini_embed([f"{row['title']} — {row['description'] or ''}"]))[0]
                upsert_resource(row, vec)
                inserted += 1
                got += 1
            page += 1
    return {"inserted": inserted}

# ---------- Coursera sitemap (free): parse a small batch ----------

SITEMAP_URL = "https://www.coursera.org/sitemap~www~courses.xml"

@app.get("/seed/coursera", response_model=SeedOut)
async def seed_coursera(limit: int = Query(50, ge=1, le=500)):
    """
    Reads Coursera courses sitemap (free), fetches first N pages, parses title/desc, stores.
    """
    global SKILL_TERMS_CACHE
    if SKILL_TERMS_CACHE is None:
        SKILL_TERMS_CACHE = load_skill_terms()

    inserted = 0
    async with httpx.AsyncClient(timeout=30) as client:
        # 1) fetch the XML sitemap
        r = await client.get(SITEMAP_URL)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "xml")
        locs = [loc.get_text() for loc in soup.find_all("loc")]
        locs = [u for u in locs if "/learn/" in u][:limit]

        for url in locs:
            try:
                page = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if page.status_code != 200:
                    continue
                html = BeautifulSoup(page.text, "html.parser")

                # title / description (fallback to og/meta)
                title = (html.select_one("title") or {}).get_text(strip=True) or None
                og_t = html.find("meta", property="og:title")
                if og_t and (not title or " | Coursera" in title):
                    title = og_t.get("content", title)
                desc = None
                og_d = html.find("meta", property="og:description")
                if og_d: desc = og_d.get("content")
                if not desc:
                    md = html.find("meta", attrs={"name": "description"})
                    if md: desc = md.get("content")

                # hours (heuristic)
                hours = parse_hours_from_text(page.text) or 8.0

                row = {
                    "title": title[:255] if title else "Coursera Course",
                    "provider": "Coursera",
                    "url": url,
                    "hours_estimate": round(float(hours), 1),
                    "cost": 0.0,
                    "skill_targets": infer_skill_targets(title or "", desc or "", SKILL_TERMS_CACHE),
                    "description": (desc or "")[:12000],
                }
                vec = (await gemini_embed([f"{row['title']} — {row['description'] or ''}"]))[0]
                upsert_resource(row, vec)
                inserted += 1
            except Exception:
                # skip noisy pages
                continue

    return {"inserted": inserted}


@app.post("/seed/skills/bulk")
async def seed_skills_bulk(
    skills: List[Dict[str, Any]] = Body(..., example=[
        {"skill_name": "Rust", "category": "Programming", "aliases": ["Rustlang"]},
        {"skill_name": "Tokio", "category": "Async", "aliases": ["Tokio runtime"]},
    ])
):
    inserted = 0
    names_for_embed = []
    for s in skills:
        name = s.get("skill_name")
        if not name:
            continue
        cat = s.get("category")
        aliases = s.get("aliases") or []
        upsert_skill(name, cat, aliases)
        names_for_embed.append(name)
        inserted += 1

    # embed in small batches
    for i in range(0, len(names_for_embed), 16):
        batch = names_for_embed[i:i+16]
        vecs = await gemini_embed([ " / ".join([n]) for n in batch ])
        for n, v in zip(batch, vecs):
            set_skill_embedding(n, v)

    return {"ok": True, "inserted": inserted}


@app.get("/seed/skills/esco")
async def seed_skills_esco(url: str, limit: int = 1000):
    """
    Ingest ESCO-like export from a URL.
    - CSV: expects columns 'preferredLabel' and (optional) 'altLabels'
    - JSON: expects list[ { preferredLabel, altLabels? } ]
    """
    inserted = 0
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(url)
        r.raise_for_status()
        ct = r.headers.get("content-type", "").lower()

        rows = []
        if "application/json" in ct or r.text.strip().startswith("["):
            data = r.json()
            for obj in data:
                name = obj.get("preferredLabel") or obj.get("label") or obj.get("name")
                if not name:
                    continue
                aliases_raw = obj.get("altLabels") or obj.get("aliases") or []
                if isinstance(aliases_raw, str):
                    aliases = [a.strip() for a in re.split(r"[|,;]", aliases_raw) if a.strip()]
                else:
                    aliases = [str(a).strip() for a in aliases_raw if str(a).strip()]
                rows.append({"name": name, "aliases": aliases})
        else:
            # CSV path
            text_data = r.text
            reader = csv.DictReader(StringIO(text_data))
            for rec in reader:
                name = rec.get("preferredLabel") or rec.get("label") or rec.get("name")
                if not name:
                    continue
                aliases_raw = rec.get("altLabels") or rec.get("aliases") or ""
                aliases = [a.strip() for a in re.split(r"[|,;]", aliases_raw) if a.strip()]
                rows.append({"name": name, "aliases": aliases})

    # Upsert + embed (batched)
    names_batch, embed_texts = [], []
    for row in rows[:limit]:
        upsert_skill(row["name"], None, row["aliases"])
        names_batch.append(row["name"])
        # embed name + top 3 aliases to capture semantics
        embed_texts.append(" / ".join([row["name"], *row["aliases"][:3]]))

    for i in range(0, len(names_batch), 16):
        chunk_names = names_batch[i:i+16]
        chunk_texts = embed_texts[i:i+16]
        vecs = await gemini_embed(chunk_texts)
        for n, v in zip(chunk_names, vecs):
            set_skill_embedding(n, v)
            inserted += 1

    return {"ok": True, "inserted": inserted}

@app.post("/seed/skills/embeddings")
async def seed_skills_embeddings(limit: int = 1000):
    with engine.begin() as conn:
        missing = conn.execute(
            text("SELECT skill_name, aliases FROM skills_catalog WHERE embedding IS NULL LIMIT :lim"),
            {"lim": limit},
        ).mappings().all()

    if not missing:
        return {"ok": True, "updated": 0}

    names, texts = [], []
    for r in missing:
        names.append(r["skill_name"])
        aliases = []
        try:
            aliases = json.loads(r["aliases"] or "[]")
        except Exception:
            pass
        texts.append(" / ".join([r["skill_name"], *[a for a in aliases[:3] if isinstance(a, str)]]))

    updated = 0
    for i in range(0, len(names), 16):
        chunk_names = names[i:i+16]
        chunk_texts = texts[i:i+16]
        vecs = await gemini_embed(chunk_texts)
        for n, v in zip(chunk_names, vecs):
            set_skill_embedding(n, v)
            updated += 1

    return {"ok": True, "updated": updated}


from sqlalchemy import text
import csv
from io import StringIO

def upsert_skill(skill_name: str, category: Optional[str], aliases: List[str]):
    with engine.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO skills_catalog (skill_name, category, aliases)
            VALUES (:n, :c, :a)
            ON DUPLICATE KEY UPDATE
              category = VALUES(category),
              aliases  = VALUES(aliases)
            """),
            {"n": skill_name[:128], "c": (category or None), "a": json.dumps(aliases or [])},
        )

def set_skill_embedding(skill_name: str, vec: List[float]):
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE skills_catalog SET embedding = CAST(:vec AS VECTOR) WHERE skill_name = :n"),
            {"vec": json.dumps(vec), "n": skill_name[:128]},
        )


# ---------- Health ----------

@app.get("/healthz")
def healthz():
    with engine.begin() as conn:
        conn.execute(text("SELECT 1"))
    return {"ok": True}
