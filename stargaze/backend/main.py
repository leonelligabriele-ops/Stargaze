"""
Stargaze — FastAPI backend.

Single endpoint: GET /search?q=...

Query pipeline
──────────────
a) Exact/fuzzy title match   (rapidfuzz WRatio >= 92)
   → use that movie's embedding as query vec; skip b/c
b) Director match            (rapidfuzz WRatio >= 92)
   → guarantee all director films in top-50; fill rest by similarity
c) Semantic query expansion  (keyword-list detection + template)
   → always ends with BGE retrieval prefix
d) Dense retrieval           (dot product, top-50)
e) Constellation graph       (constellation.build_constellation)
"""
from __future__ import annotations

import os
import re
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer

import constellation as C
from constellation import load_data


def _load_env_local() -> None:
    """Load KEY=VALUE pairs from backend/.env.local into the environment."""
    env_path = Path(__file__).parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


_load_env_local()

# ── Model ─────────────────────────────────────────────────────────────────────
MODEL_NAME = "BAAI/bge-small-en-v1.5"
# BGE asymmetric-retrieval prefix: applied to queries, NOT to stored document text.
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


# ── Lookup tables (built once at startup) ─────────────────────────────────────
_title_choices: list[str] = []      # all titles + original_titles
_title_row_map:  list[int] = []     # aligned row index for each entry above
_director_names: list[str] = []     # unique director names (for rapidfuzz)
_director_to_rows: dict[str, list[int]] = {}  # name → rows sorted by vote_count desc


def _build_lookup_tables() -> None:
    index, _, _ = load_data()

    for i, m in enumerate(index):
        title = m.get("title") or ""
        orig  = m.get("original_title") or ""
        if title:
            _title_choices.append(title)
            _title_row_map.append(i)
        if orig and orig != title:
            _title_choices.append(orig)
            _title_row_map.append(i)

    tmp: dict[str, list[int]] = defaultdict(list)
    for i, m in enumerate(index):
        d = m.get("director")
        if d:
            tmp[d].append(i)

    for d, rows in tmp.items():
        _director_to_rows[d] = sorted(
            rows,
            key=lambda i: (index[i].get("vote_count") or 0),
            reverse=True,
        )

    _director_names.extend(_director_to_rows.keys())


# ── Query-expansion helpers ────────────────────────────────────────────────────
# Tokens whose presence signals a natural-language sentence rather than keywords.
_SENTENCE_TOKENS = {
    "is", "are", "was", "were", "has", "have", "had", "be", "been", "being",
    "do", "does", "did", "will", "would", "could", "should", "can", "may", "might",
    "want", "wants", "need", "needs", "make", "makes", "made",
    "follow", "follows", "tell", "tells", "feature", "features",
    "show", "shows", "involve", "involves", "explore", "explores",
    "depict", "depicts", "center", "centres", "about", "that", "which",
}


def _is_keyword_list(q: str) -> bool:
    """True when q looks like comma/space-separated keywords (no verbs, ≤ 6 tokens)."""
    if "," in q:
        parts = [p.strip() for p in q.split(",") if p.strip()]
        return len(parts) <= 6
    tokens = q.lower().split()
    return len(tokens) <= 6 and not any(t in _SENTENCE_TOKENS for t in tokens)


def _expand_query(q: str) -> str:
    """Return the final string to embed (always includes the BGE prefix)."""
    if _is_keyword_list(q):
        tokens = [t.strip() for t in re.split(r"[,\s]+", q) if t.strip()]
        body = (
            f"A film with the following qualities, setting, mood, or origin: "
            f"{', '.join(tokens)}. "
            f"The movie's atmosphere, location, country, and themes match these words."
        )
    else:
        body = q
    return BGE_QUERY_PREFIX + body


# ── App lifecycle ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        load_data()
        _build_lookup_tables()
        get_model()
        print("Stargaze ready.")
    except RuntimeError as e:
        print(f"WARNING at startup: {e}")
    yield


app = FastAPI(title="Stargaze API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/search")
def search(q: str = Query(..., min_length=1, description="Movie title, director, theme, or keywords")):
    q = q.strip()
    index, emb, _ = load_data()
    N = len(index)
    K = min(50, N)

    query_vec: np.ndarray | None = None
    director_bias: str | None = None   # set in step b
    search_type = "semantic"           # updated in steps a/b

    # ── a) Exact / fuzzy title match ──────────────────────────────────────
    if _title_choices:
        hit = process.extractOne(q, _title_choices, scorer=fuzz.WRatio)
        if hit is not None and hit[1] >= 92:
            center_row  = _title_row_map[hit[2]]
            query_vec   = emb[center_row].copy()
            search_type = "title"

    # ── b) Director name match ────────────────────────────────────────────
    if query_vec is None and _director_names:
        hit = process.extractOne(q, _director_names, scorer=fuzz.WRatio)
        if hit is not None and hit[1] >= 92:
            director_bias = hit[0]
            center_row    = _director_to_rows[director_bias][0]
            query_vec     = emb[center_row].copy()
            search_type   = "director"

    # ── c) Semantic / keyword expansion ───────────────────────────────────
    if query_vec is None:
        query_vec = get_model().encode(
            [_expand_query(q)],
            normalize_embeddings=True,
            convert_to_numpy=True,
        )[0]

    # ── d) Dense retrieval ────────────────────────────────────────────────
    all_scores = emb @ query_vec        # (N,) — dot product of normalised vecs

    if director_bias is not None:
        dir_rows = _director_to_rows[director_bias]   # already sorted by vote_count
        dir_set  = set(dir_rows)

        # Director's films — all of them (with their actual similarity scores)
        dir_candidates = [(i, float(all_scores[i])) for i in dir_rows]

        if len(dir_candidates) >= K:
            # More director films than K: keep top-K by score (center = row 0 → score 1.0)
            top50 = sorted(dir_candidates, key=lambda x: x[1], reverse=True)[:K]
        else:
            k_fill = K - len(dir_candidates)
            fill = sorted(
                ((i, float(all_scores[i])) for i in range(N) if i not in dir_set),
                key=lambda x: x[1],
                reverse=True,
            )[:k_fill]
            # Sort combined list; center (score 1.0) naturally first
            top50 = sorted(dir_candidates + fill, key=lambda x: x[1], reverse=True)

    else:
        if N <= K:
            top_idxs = np.arange(N)
        else:
            top_idxs = np.argpartition(all_scores, -K)[-K:]
        top_idxs = top_idxs[np.argsort(all_scores[top_idxs])[::-1]]
        top50 = [(int(i), float(all_scores[i])) for i in top_idxs]

    center_id = str(index[top50[0][0]]["tmdb_id"])

    # ── e) Constellation graph ────────────────────────────────────────────
    return C.build_constellation(center_id, top50, search_context={
        "type":          search_type,
        "query":         q,
        "director_name": director_bias,
    })


# ── Constellation from a set of ids (Step 4 — profile collections) ──────────────
@app.get("/constellation")
def constellation_from_ids(
    ids: str = Query("", description="Comma-separated tmdb ids of saved films"),
):
    id_list = [s for s in (ids or "").split(",") if s.strip()]
    return C.build_constellation_from_ids(id_list)


# ── Full movie page (Step 3) ────────────────────────────────────────────────────
@app.get("/movie/{tmdb_id}")
def movie_detail(tmdb_id: int):
    """All stored fields for one film, for the /film/{id} page."""
    index, _, id_to_row = load_data()
    row_i = id_to_row.get(int(tmdb_id))
    if row_i is None:
        raise HTTPException(status_code=404, detail="Movie not found")
    m = index[row_i]
    return {
        "id":                str(m["tmdb_id"]),
        "title":             m.get("title"),
        "original_title":    m.get("original_title"),
        "year":              m.get("year"),
        "director":          m.get("director"),
        "cast":              m.get("cast") or [],
        "genres":            m.get("genres") or [],
        "countries":         m.get("countries") or [],
        "keywords":          m.get("keywords") or [],
        "original_language": m.get("original_language"),
        "rating":            m.get("vote_average"),
        "vote_count":        m.get("vote_count"),
        "poster_url":        C._poster_url(m.get("poster_path")),
        "description":       m.get("overview") or "",
    }


# ── Where to watch (live TMDB) ───────────────────────────────────────────────────
_TMDB_BASE = "https://api.themoviedb.org/3"
_PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/w92"
_providers_cache: dict[tuple[int, str], dict] = {}

# TMDB groups providers by monetisation type; collapse to a friendly label.
_PROVIDER_KINDS = ["flatrate", "free", "ads", "rent", "buy"]
_KIND_LABEL = {"flatrate": "stream", "free": "free", "ads": "free", "rent": "rent", "buy": "buy"}


def _empty_providers(region: str) -> dict:
    return {"region": region, "count": 0, "providers": [], "link": None, "available": False}


@app.get("/movie/{tmdb_id}/providers")
def movie_providers(tmdb_id: int, region: str = "US"):
    """Live streaming/rental availability from TMDB for the WHERE TO WATCH panel."""
    region = region.upper()
    key = (int(tmdb_id), region)
    if key in _providers_cache:
        return _providers_cache[key]

    token = os.environ.get("TMDB_API_KEY")
    if not token:
        return _empty_providers(region)

    try:
        r = httpx.get(
            f"{_TMDB_BASE}/movie/{tmdb_id}/watch/providers",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        r.raise_for_status()
        region_data = r.json().get("results", {}).get(region, {})
    except Exception:
        return _empty_providers(region)

    seen: dict[str, dict] = {}
    for kind in _PROVIDER_KINDS:
        for p in (region_data.get(kind) or []):
            name = p.get("provider_name")
            if not name or name in seen:
                continue
            seen[name] = {
                "name": name,
                "logo_url": f"{_PROVIDER_LOGO_BASE}{p['logo_path']}" if p.get("logo_path") else None,
                "type": _KIND_LABEL.get(kind, kind),
            }

    providers = list(seen.values())
    result = {
        "region": region,
        "count": len(providers),
        "providers": providers,
        "link": region_data.get("link"),
        "available": bool(providers),
    }
    _providers_cache[key] = result
    return result
