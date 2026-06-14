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
from rapidfuzz import fuzz, process, utils
from sentence_transformers import SentenceTransformer

import constellation as C
import filters as F
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
_person_to_rows: dict[str, list[int]] = {}    # lower(name) → rows (any role) by vote_count
_filter_index: F.FilterIndex | None = None    # per-row facets for filtering
_hubness: np.ndarray | None = None            # per-film hubness, 0..1


def _vote_count(m: dict) -> float:
    vc = m.get("vote_count")
    return vc if isinstance(vc, (int, float)) and vc == vc else 0

# ── Diversity-aware retrieval tuning ──────────────────────────────────────────
HUBNESS_BETA   = 0.35   # how strongly to demote universally-central "hub" films
MMR_LAMBDA     = 0.70   # relevance vs. diversity in MMR re-ranking
DIVERSE_POOL_M = 220    # shortlist size fed to MMR
SAMPLE_TOPN    = 4      # pick randomly among the best N each step ("fresh each time")


def _clean_str(v) -> str | None:
    """Stripped non-empty string, or None (parquet stores missing scalars as NaN)."""
    return v.strip() if isinstance(v, str) and v.strip() else None


def _build_lookup_tables() -> None:
    index, _, _ = load_data()

    for i, m in enumerate(index):
        title = _clean_str(m.get("title"))
        orig  = _clean_str(m.get("original_title"))
        if title:
            _title_choices.append(title)
            _title_row_map.append(i)
        if orig and orig != title:
            _title_choices.append(orig)
            _title_row_map.append(i)
        # Alternate / international titles → match foreign or re-released titles.
        for alt in (m.get("alt_titles") or []):
            a = _clean_str(alt)
            if a and a != title and a != orig:
                _title_choices.append(a)
                _title_row_map.append(i)

    tmp: dict[str, list[int]] = defaultdict(list)
    for i, m in enumerate(index):
        d = _clean_str(m.get("director"))
        if d:
            tmp[d].append(i)

    for d, rows in tmp.items():
        _director_to_rows[d] = sorted(rows, key=lambda i: _vote_count(index[i]), reverse=True)

    _director_names.extend(_director_to_rows.keys())

    # Reverse index: any person (director, cast, writer, DoP, producer) → their films.
    people: dict[str, list[int]] = defaultdict(list)
    for i, m in enumerate(index):
        names: set[str] = set()
        d = _clean_str(m.get("director"))
        if d:
            names.add(d)
        for key in ("cast", "writers", "dop", "producers"):
            for nm in (m.get(key) or []):
                c = _clean_str(nm)
                if c:
                    names.add(c)
        for nm in names:
            people[nm.lower()].append(i)
    for nm, rows in people.items():
        _person_to_rows[nm] = sorted(rows, key=lambda i: _vote_count(index[i]), reverse=True)


def _build_hubness(emb: np.ndarray, n_anchors: int = 2500, k: int = 25) -> np.ndarray:
    """Per-film hubness: how often a film is a top-k neighbour of random anchors.

    Hub films (near-neighbours of *many* others, e.g. a 'prototypical horror'
    title) score high and get gently demoted so they don't recur everywhere.
    """
    n = len(emb)
    rng = np.random.default_rng(0)
    anchors = rng.choice(n, size=min(n_anchors, n), replace=False)
    counts = np.zeros(n, dtype=np.float64)
    for start in range(0, len(anchors), 256):
        sims = emb[anchors[start:start + 256]] @ emb.T          # (chunk, N)
        nn = np.argpartition(-sims, k, axis=1)[:, :k]           # top-k per anchor
        np.add.at(counts, nn.ravel(), 1.0)
    return counts / (counts.max() or 1.0)


def _select_diverse(emb, query_vec, pool, K, rng, center_idx=None, exclude=None):
    """Diverse, hub-penalised, slightly-stochastic top-K selection.

    Returns [(row_idx, relevance_score)] with the centre first.
      · pool: 1-D array of candidate row indices, or None for the whole corpus.
      · center_idx: force this row as the centre (title/director/expand); else
        the centre is sampled among the top few for freshness.
      · exclude: set of row indices to drop (e.g. user-blocked films).
    """
    if pool is None:
        pool = np.arange(len(emb))
    if exclude:
        pool = pool[~np.isin(pool, np.fromiter(exclude, dtype=int))]
        if pool.size == 0:
            return []
    rel = emb[pool] @ query_vec
    adj = rel - HUBNESS_BETA * _hubness[pool]            # demote hubs

    M = min(DIVERSE_POOL_M, len(pool))
    part = np.argpartition(adj, -M)[-M:] if len(pool) > M else np.arange(len(pool))
    cand     = pool[part]
    cand_rel = rel[part]
    cand_adj = adj[part]
    cand_emb = emb[cand]

    chosen: list[int] = []
    chosen_mask = np.zeros(len(cand), dtype=bool)

    if center_idx is not None:
        hit = np.where(cand == center_idx)[0]
        c = int(hit[0]) if len(hit) else int(cand_adj.argmax())
    else:
        top = np.argsort(cand_adj)[::-1][:3]
        c = int(top[rng.integers(len(top))])
    chosen.append(c)
    chosen_mask[c] = True

    target = min(K, len(cand))
    while len(chosen) < target:
        red = (cand_emb @ cand_emb[chosen].T).max(axis=1)       # redundancy vs picked
        mmr = MMR_LAMBDA * cand_adj - (1.0 - MMR_LAMBDA) * red
        remaining = np.where(~chosen_mask)[0]
        order = remaining[np.argsort(mmr[remaining])[::-1]]
        topn = order[:SAMPLE_TOPN]
        pick = int(topn[rng.integers(len(topn))])
        chosen.append(pick)
        chosen_mask[pick] = True

    return [(int(cand[i]), float(cand_rel[i])) for i in chosen]


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
    """True when q looks like a list of keywords/themes rather than a sentence.

    Detailed searches can list many themes — a comma-separated query is always
    treated as keywords (no length cap); a space-separated query qualifies when
    it has no sentence verbs and isn't excessively long.
    """
    if "," in q:
        return True
    tokens = q.lower().split()
    return len(tokens) <= 16 and not any(t in _SENTENCE_TOKENS for t in tokens)


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
        index, emb, _ = load_data()
        _build_lookup_tables()
        global _filter_index, _hubness
        _filter_index = F.FilterIndex(index)
        _hubness = _build_hubness(emb)
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


_EMPTY_GRAPH = {"center": None, "nodes": [], "links": []}


def _selected_filters(region, status, decade, genre, length) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for key, raw in (("region", region), ("status", status), ("decade", decade),
                     ("genre", genre), ("length", length)):
        vals = {v.strip() for v in (raw or "").split(",") if v.strip()}
        if vals:
            out[key] = vals
    return out


def _blocked_rows(blocked: str) -> set[int]:
    """Row indices for user-blocked tmdb ids (excluded from recommendations)."""
    if not blocked:
        return set()
    _, _, id_to_row = load_data()
    out: set[int] = set()
    for s in blocked.split(","):
        s = s.strip()
        if s.isdigit():
            r = id_to_row.get(int(s))
            if r is not None:
                out.add(r)
    return out


@app.get("/search")
def search(
    q: str = Query("", description="Movie title, director, theme, or keywords"),
    region: str = Query(""),
    status: str = Query(""),
    decade: str = Query(""),
    genre: str = Query(""),
    length: str = Query(""),
    blocked: str = Query(""),
):
    q = q.strip()
    index, emb, _ = load_data()
    N = len(index)
    K = min(50, N)
    blocked_rows = _blocked_rows(blocked)

    # ── Filters → allowed pool ────────────────────────────────────────────
    selected = _selected_filters(region, status, decade, genre, length)
    if selected and _filter_index is not None:
        mask = _filter_index.mask(selected)
        allowed = np.where(mask)[0]
        if allowed.size == 0:
            return _EMPTY_GRAPH          # filters exclude everything
    else:
        allowed = None                   # no filtering

    # Nothing to search and nothing to filter by → empty.
    if not q and allowed is None:
        return dict(_EMPTY_GRAPH)

    rng = np.random.default_rng()   # fresh each request → varied results

    # ── Browse mode: filters only, no query → diverse popularity-weighted ─
    if not q:
        pool = [int(i) for i in allowed if int(i) not in blocked_rows]
        if not pool:
            return dict(_EMPTY_GRAPH)
        weights = np.array([_vote_count(index[i]) or 1.0 for i in pool], dtype=float)
        weights = weights / weights.sum()
        size = min(K, len(pool))
        chosen = rng.choice(pool, size=size, replace=False, p=weights)
        return C.build_constellation_from_ids(
            [str(index[int(i)]["tmdb_id"]) for i in chosen], ctx_type="browse",
        )

    # ── Search mode ───────────────────────────────────────────────────────
    query_vec: np.ndarray | None = None
    director_bias: str | None = None
    forced_center: int | None = None
    search_type = "semantic"

    # a) Exact / fuzzy title match (case/punctuation-insensitive)
    if _title_choices:
        hit = process.extractOne(q, _title_choices, scorer=fuzz.WRatio,
                                 processor=utils.default_process)
        if hit is not None and hit[1] >= 92:
            forced_center = _title_row_map[hit[2]]
            query_vec     = emb[forced_center].copy()
            search_type   = "title"

    # b) Director name match
    if query_vec is None and _director_names:
        hit = process.extractOne(q, _director_names, scorer=fuzz.WRatio,
                                 processor=utils.default_process)
        if hit is not None and hit[1] >= 92:
            director_bias = hit[0]
            forced_center = _director_to_rows[director_bias][0]
            query_vec     = emb[forced_center].copy()
            search_type   = "director"

    # c) Semantic / keyword expansion
    if query_vec is None:
        query_vec = get_model().encode(
            [_expand_query(q)], normalize_embeddings=True, convert_to_numpy=True,
        )[0]

    # d) Diverse, hub-penalised retrieval (within the allowed pool if filtered)
    if director_bias is not None and allowed is None:
        # Unfiltered director search: guarantee the director's films, diversify the fill.
        all_scores = emb @ query_vec
        dir_rows = [r for r in _director_to_rows[director_bias] if r not in blocked_rows]
        dir_set  = set(dir_rows)
        dir_candidates = [(i, float(all_scores[i])) for i in dir_rows]
        if len(dir_candidates) >= K:
            top50 = sorted(dir_candidates, key=lambda x: x[1], reverse=True)[:K]
        else:
            non_dir = np.array([i for i in range(N) if i not in dir_set])
            fill = _select_diverse(emb, query_vec, non_dir, K - len(dir_candidates), rng,
                                   exclude=blocked_rows)
            top50 = sorted(dir_candidates + fill, key=lambda x: x[1], reverse=True)
    else:
        top50 = _select_diverse(emb, query_vec, allowed, K, rng,
                                center_idx=forced_center, exclude=blocked_rows)

    if not top50:
        return dict(_EMPTY_GRAPH)
    center_id = str(index[top50[0][0]]["tmdb_id"])

    # e) Constellation graph
    return C.build_constellation(center_id, top50, search_context={
        "type":          search_type,
        "query":         q,
        "director_name": director_bias,
    })


# ── Expand from a star: films most similar to a given film ──────────────────────
@app.get("/similar/{tmdb_id}")
def similar(
    tmdb_id: int,
    n: int = Query(25, ge=2, le=60, description="How many films in the sub-constellation"),
    blocked: str = Query(""),
):
    """
    Build a constellation centred on one film, from its nearest neighbours.
    Powers "expand from this star" — the result is merged into the existing graph.
    """
    index, emb, id_to_row = load_data()
    row = id_to_row.get(int(tmdb_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Movie not found")

    N = len(index)
    K = min(n, N)
    rng = np.random.default_rng()   # fresh each expand
    # Diverse neighbours, with the chosen film forced as the centre (never blocked).
    exclude = _blocked_rows(blocked) - {row}
    candidates = _select_diverse(emb, emb[row], None, K, rng, center_idx=row, exclude=exclude)
    if not candidates:
        return dict(_EMPTY_GRAPH)

    center_id = str(index[row]["tmdb_id"])
    return C.build_constellation(
        center_id,
        candidates,
        search_context={"type": "title", "query": index[row].get("title") or ""},
    )


# ── Person constellation: every film involving a director / actor / crew member ─
@app.get("/person")
def person(
    name: str = Query(..., min_length=1, description="Director, actor or crew name"),
    blocked: str = Query(""),
):
    index, _, _ = load_data()
    rows = _person_to_rows.get(name.strip().lower())
    if not rows:
        return dict(_EMPTY_GRAPH)
    blocked_rows = _blocked_rows(blocked)
    top = [r for r in rows if r not in blocked_rows][:50]   # already sorted by vote_count
    if not top:
        return dict(_EMPTY_GRAPH)
    return C.build_constellation_from_ids(
        [str(index[i]["tmdb_id"]) for i in top], ctx_type="person",
    )


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
    resp = {
        "id":                str(m["tmdb_id"]),
        "title":             m.get("title"),
        "original_title":    m.get("original_title"),
        "tagline":           m.get("tagline"),
        "year":              m.get("year"),
        "director":          m.get("director"),
        "writers":           m.get("writers") or [],
        "dop":               m.get("dop") or [],
        "producers":         m.get("producers") or [],
        "cast":              m.get("cast") or [],
        "genres":            m.get("genres") or [],
        "countries":         m.get("countries") or [],
        "keywords":          m.get("keywords") or [],
        "original_language": m.get("original_language"),
        "runtime":           m.get("runtime"),
        "rating":            m.get("vote_average"),
        "vote_count":        m.get("vote_count"),
        "poster_url":        C._poster_url(m.get("poster_path")),
        "description":       m.get("overview") or "",
    }
    # JSON can't represent NaN (Starlette rejects it) — null out missing scalars.
    return {k: (None if isinstance(v, float) and v != v else v) for k, v in resp.items()}


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


# ── Trailer (live TMDB videos) ───────────────────────────────────────────────────
_trailer_cache: dict[int, dict] = {}
_NO_TRAILER = {"key": None, "site": None, "name": None}


@app.get("/movie/{tmdb_id}/trailer")
def movie_trailer(tmdb_id: int):
    """Best YouTube trailer/teaser for a film (for the TRAILER section)."""
    tid = int(tmdb_id)
    if tid in _trailer_cache:
        return _trailer_cache[tid]

    token = os.environ.get("TMDB_API_KEY")
    if not token:
        return dict(_NO_TRAILER)

    try:
        r = httpx.get(
            f"{_TMDB_BASE}/movie/{tid}/videos",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        r.raise_for_status()
        videos = r.json().get("results", [])
    except Exception:
        return dict(_NO_TRAILER)

    candidates = [
        v for v in videos
        if v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser") and v.get("key")
    ]
    if not candidates:
        result = dict(_NO_TRAILER)
    else:
        # Prefer real Trailers, official uploads, English, then most recent.
        def rank(v):
            return (
                v.get("type") == "Trailer",
                bool(v.get("official")),
                v.get("iso_639_1") == "en",
                v.get("published_at") or "",
            )
        best = max(candidates, key=rank)
        result = {"key": best.get("key"), "site": "YouTube", "name": best.get("name")}

    _trailer_cache[tid] = result
    return result
