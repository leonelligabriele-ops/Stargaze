"""
Constellation graph construction.

build_constellation(center_id, candidates) → dict

  candidates: list of (row_idx, cosine_score), center movie first.

Edge rules (applied in order):
  1. Each node connects to its 3 most similar peers within the 50-set;
     edges with pairwise similarity < 0.45 are dropped.
  2. The central node always connects to its top-5 peers (no threshold).
  3. Any component not containing the center gets one bridge edge from its
     node that is most similar to the center.

Returns:
  {
    "center": "<tmdb_id>",
    "nodes": [{"id", "title", "year", "director", "genres", "score"}, ...],
    "links": [{"source", "target", "weight"}, ...]
  }
"""
from __future__ import annotations

import json
import os
import re
from collections import deque
from pathlib import Path
from typing import Optional

import numpy as np

DATA_DIR = Path(__file__).parent / "data"

# Edge construction: mutual k-NN clusters + a max-spanning-tree backbone.
KNN = 4                 # neighbours considered per node for mutual-kNN edges
EDGE_THRESHOLD = 0.42   # min cosine sim for a (non-backbone) cluster edge

# TMDB image CDN base for poster thumbnails (w500 ≈ 500px wide).
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"


def _poster_url(poster_path: Optional[str]) -> Optional[str]:
    """Build a full TMDB poster URL, or None when the path is absent."""
    if not poster_path:
        return None
    return f"{TMDB_IMAGE_BASE}{poster_path}"


def _year_int(v) -> Optional[int]:
    """Year as int, or None — parquet stores a missing year as float NaN."""
    if isinstance(v, (int, float)) and v == v:   # v == v is False only for NaN
        return int(v)
    return None

_index: Optional[list[dict]] = None
_embeddings: Optional[np.ndarray] = None
_id_to_row: Optional[dict[int, int]] = None


def _download(url: str, dest: Path) -> None:
    """Stream a URL to dest, writing to a .tmp file first then renaming, so a
    crashed/partial download never leaves a corrupt file in place."""
    import httpx

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    print(f"Downloading {dest.name} from {url} …")
    with httpx.stream("GET", url, follow_redirects=True, timeout=None) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=1 << 20):
                f.write(chunk)
    tmp.replace(dest)
    print(f"  → {dest.name} ready ({dest.stat().st_size / 1e6:.0f} MB)")


def ensure_data() -> None:
    """Fetch the runtime data files if they're missing and download URLs are set.

    On a fresh cloud instance the data isn't in the repo (it's gitignored), so we
    pull embeddings.npy / index.json from the URLs in EMBEDDINGS_URL / INDEX_URL
    (e.g. GitHub Release assets). Local dev keeps the files on disk, so this is a
    no-op there. Files persist for the instance lifetime → downloads once per cold
    start.
    """
    targets = {
        "embeddings.npy": os.environ.get("EMBEDDINGS_URL"),
        "index.json": os.environ.get("INDEX_URL"),
    }
    for name, url in targets.items():
        dest = DATA_DIR / name
        if dest.exists() or not url:
            continue
        _download(url, dest)


def load_data() -> tuple[list[dict], np.ndarray, dict[int, int]]:
    global _index, _embeddings, _id_to_row

    if _index is not None:
        return _index, _embeddings, _id_to_row

    ensure_data()   # fetch from EMBEDDINGS_URL / INDEX_URL if absent (cloud cold start)

    idx_path = DATA_DIR / "index.json"
    emb_path = DATA_DIR / "embeddings.npy"

    if not idx_path.exists():
        raise RuntimeError("data/index.json missing — set INDEX_URL or run build_embeddings.py")
    if not emb_path.exists():
        raise RuntimeError("data/embeddings.npy missing — set EMBEDDINGS_URL or run build_embeddings.py")

    with open(idx_path, encoding="utf-8") as f:
        _index = json.load(f)

    _embeddings = np.load(emb_path)

    if len(_index) != len(_embeddings):
        raise RuntimeError(
            f"index.json ({len(_index)}) and embeddings.npy ({len(_embeddings)}) "
            "row counts differ — rebuild with build_embeddings.py"
        )

    _id_to_row = {int(m["tmdb_id"]): i for i, m in enumerate(_index)}
    return _index, _embeddings, _id_to_row


def _bfs_components(n: int, adj: list[set[int]]) -> list[list[int]]:
    visited = [False] * n
    components: list[list[int]] = []
    for start in range(n):
        if visited[start]:
            continue
        comp: list[int] = []
        q: deque[int] = deque([start])
        visited[start] = True
        while q:
            node = q.popleft()
            comp.append(node)
            for nb in adj[node]:
                if not visited[nb]:
                    visited[nb] = True
                    q.append(nb)
        components.append(comp)
    return components


# TMDB keywords that carry production/credits metadata rather than theme —
# skip these when describing what a film is "about".
_GENERIC_KEYWORDS = {
    "based on novel or book", "based on novel", "based on book",
    "based on true story", "based on comic", "based on play",
    "based on short story", "based on young adult novel",
    "duringcreditsstinger", "aftercreditsstinger", "woman director",
    "sequel", "prequel", "remake", "live action", "3d", "imax",
    "independent film", "cult film", "blockbuster",
}

# TMDB auto-appends single-word "mood/vibe" tags to most films (e.g. "excited",
# "vibrant"). They match spuriously across unrelated movies, so they make poor
# "why this" signals — exclude them and keep concrete, noun-like themes.
_MOOD_TAGS = {
    "excited", "vibrant", "grim", "melancholy", "suspenseful", "aggressive",
    "domineering", "nervous", "taunting", "questioning", "unassuming",
    "reflective", "wistful", "provocative", "witty", "sinister", "whimsical",
    "pretentious", "sincere", "skeptical", "straightforward", "sympathetic",
    "tragic", "gloomy", "cheerful", "tense", "eerie", "heartfelt", "quirky",
    "gritty", "stylish", "bleak", "uplifting", "intense", "charming",
    "lighthearted", "somber", "playful", "humorous", "serious", "emotional",
    "thrilling", "scary", "hopeful", "hopeless", "brutal", "calm",
    "disturbing", "unsettling", "moody", "contemplative", "absurd", "campy",
    "cheesy", "sweeping", "intimate", "claustrophobic", "paranoid", "cynical",
    "satirical", "nostalgic", "dreamlike", "hypnotic", "meditative", "visceral",
    "raw", "gripping", "captivating", "enchanting", "chilling", "dark",
    "exciting", "boring", "energetic", "optimistic", "pessimistic", "depressing",
    "feel good", "fast paced", "slow", "touching", "inspiring", "menacing",
}

_DECADE_RE = re.compile(r"^\d{4}s$")  # "2010s", "1980s" — era tags, not themes


def _is_thematic(kw: str) -> bool:
    """True when a keyword names a concrete theme (not metadata/mood/era/place)."""
    kl = kw.lower().strip()
    if not kl or kl in _GENERIC_KEYWORDS or kl in _MOOD_TAGS:
        return False
    if _DECADE_RE.match(kl):
        return False
    if "," in kl:           # geographic tags, e.g. "los angeles, california"
        return False
    return True


def _join_natural(items: list[str]) -> str:
    """['a','b','c'] -> 'a, b and c'."""
    items = list(items)
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])} and {items[-1]}"


# Country → adjective, so "United States of America" reads as "American".
_DEMONYMS = {
    "United States of America": "American", "United States": "American",
    "United Kingdom": "British", "France": "French", "Germany": "German",
    "Japan": "Japanese", "Italy": "Italian", "Spain": "Spanish",
    "Canada": "Canadian", "Australia": "Australian", "China": "Chinese",
    "South Korea": "South Korean", "India": "Indian", "Russia": "Russian",
    "Soviet Union": "Soviet", "Mexico": "Mexican", "Sweden": "Swedish",
    "Denmark": "Danish", "Norway": "Norwegian", "Finland": "Finnish",
    "Brazil": "Brazilian", "Argentina": "Argentine", "Ireland": "Irish",
    "Netherlands": "Dutch", "Belgium": "Belgian", "Austria": "Austrian",
    "Poland": "Polish", "Iran": "Iranian", "Turkey": "Turkish",
    "Greece": "Greek", "Switzerland": "Swiss",
}


def _demonym(country: str) -> str:
    return _DEMONYMS.get(country, country)


def _article(word: str) -> str:
    """Indefinite article for the following word ('a'/'an')."""
    return "an" if word[:1].lower() in "aeiou" else "a"


def _possessive(name: str) -> str:
    """Possessive form — 'Star Wars'' not 'Star Wars's'."""
    return f"{name}'" if name[-1:].lower() == "s" else f"{name}'s"


def _shared_keywords(row: dict, center: dict, limit: int = 3) -> list[str]:
    """Concrete themes the film shares with the centre (mood/meta tags removed)."""
    c_kw = {k.lower() for k in (center.get("keywords") or [])}
    out: list[str] = []
    for k in (row.get("keywords") or []):
        if k.lower() in c_kw and _is_thematic(k) and k not in out:
            out.append(k)
        if len(out) >= limit:
            break
    return out


def _explain_node(
    row: dict,
    center: dict,
    score: float,
    rank: int,
    ctx: dict,
) -> str:
    """One- or two-clause reason this film surfaced, naming concrete signals."""
    q_type   = ctx.get("type", "semantic")
    query    = (ctx.get("query") or "").strip()
    ql       = query.lower()
    dir_name = ctx.get("director_name") or ""
    c_title  = center.get("title") or "the central film"
    cp       = _possessive(c_title)   # "Star Wars'" / "Interstellar's"

    # ── centre movie ──────────────────────────────────────────────────────
    if rank == 0:
        if q_type == "title":
            return f"Your search landed directly on {c_title} — the anchor of this constellation."
        if q_type == "director":
            return f"The standout film by {dir_name}, anchoring this constellation."
        if q_type == "saved":
            return f"{c_title} sits at the centre of your collection."
        if q_type == "browse":
            return f"{c_title} — a standout title matching your filters."
        if q_type == "person":
            return f"{c_title} — the most prominent film in this person's constellation."
        return f"The closest semantic match to “{query}”, anchoring this constellation."

    director  = row.get("director")
    genres    = row.get("genres") or []
    c_genres  = set(center.get("genres") or [])
    shared_g  = [g for g in genres if g in c_genres]

    shared_kw = _shared_keywords(row, center)

    shared_cast = [c for c in (row.get("cast") or []) if c in set(center.get("cast") or [])]

    countries      = row.get("countries") or []
    c_countries    = set(center.get("countries") or [])
    shared_country = next((c for c in countries if c in c_countries), None)

    year   = _year_int(row.get("year"))
    c_year = _year_int(center.get("year"))
    same_era = bool(year and c_year and abs(year - c_year) <= 7)
    decade = f"{year // 10 * 10}s" if year else ""

    def genre_phrase() -> str:
        if len(shared_g) >= 2:
            return f"{shared_g[0]} & {shared_g[1]}"
        if shared_g:
            return shared_g[0]
        return genres[0] if genres else "film"

    # 1) Film by the searched director ─────────────────────────────────────
    if q_type == "director" and director == dir_name:
        if shared_kw:
            return f"Also directed by {dir_name}, revisiting {_join_natural(shared_kw)}."
        return f"Also directed by {dir_name} — another {genre_phrase()} from the same hand."

    # 2) Shares its director with the centre ───────────────────────────────
    if director and director == center.get("director"):
        if shared_kw:
            return f"Another {director} film, sharing {cp} {_join_natural(shared_kw)}."
        return f"Also directed by {director}, the mind behind {c_title}."

    # 3) Query themes matched directly (semantic / keyword searches) ────────
    if q_type == "semantic" and ql:
        # Exclude the anchor film's own title words so the query doesn't
        # "match" a keyword that simply echoes the title (e.g. "blade runner").
        title_tokens = {
            t for t in re.split(r"[,\s]+", c_title.lower()) if len(t) > 3
        }
        q_tokens = {
            t for t in re.split(r"[,\s]+", ql)
            if len(t) > 3 and t not in title_tokens
        }
        kw_hits = []
        for k in (row.get("keywords") or []):
            if not _is_thematic(k):
                continue
            if any(t in k.lower() for t in q_tokens):
                kw_hits.append(k)
            if len(kw_hits) >= 2:
                break
        if kw_hits:
            return f"Surfaced for your search through its {_join_natural(kw_hits)} themes."
        for country in countries:
            if country.lower() in ql:
                adj = _demonym(country)
                return f"{_article(adj).capitalize()} {adj} {genre_phrase()} matching the origin you searched for."

    # 4) Shared cast with the centre ───────────────────────────────────────
    if shared_cast:
        who = shared_cast[0]
        if shared_kw:
            return f"Reunites {who} from {c_title} in another {shared_kw[0]} story."
        return f"Features {who}, who also stars in {c_title}."

    # 5) Shared specific themes with the centre (the main improvement) ──────
    if shared_kw:
        gp = genre_phrase()
        if len(shared_kw) >= 2:
            return f"A {gp} film that shares {cp} {_join_natural(shared_kw)} themes."
        return f"Echoes {cp} {shared_kw[0]} through a {gp} lens."

    # 6) Same country of origin + overlapping genre ────────────────────────
    if shared_country and shared_g:
        adj = _demonym(shared_country)
        if same_era and decade:
            return f"A {decade} {adj} {genre_phrase()}, sharing {cp} era and origin."
        return f"{_article(adj).capitalize()} {adj} {genre_phrase()}, sharing {cp} genre and origin."

    # 7) Shared genre, coloured by closeness and era ────────────────────────
    if shared_g:
        gp = genre_phrase()
        if same_era and decade:
            return f"A {decade} {gp} film sharing {cp} era, tone and subject."
        if score >= 0.82:
            return f"A {gp} film tightly aligned with {c_title} in tone and subject."
        if score >= 0.70:
            return f"Shares {cp} {gp} sensibility and emotional register."
        return f"A {gp} film orbiting the same themes as {c_title}."

    # 8) Fallback — still grounded in the anchor film ──────────────────────
    if score >= 0.80:
        return f"A strong stylistic and thematic match for {c_title}."
    if score >= 0.70:
        return f"Close to {c_title} in mood, pacing and atmosphere."
    return f"A looser companion to {c_title}, related in overall atmosphere."


def build_constellation(
    center_id: str,
    candidates: list[tuple[int, float]],   # (row_idx, cosine_score), center first
    search_context: dict | None = None,
) -> dict:
    ctx = search_context or {}
    index, emb, _ = load_data()

    n = len(candidates)
    row_indices = [ri for ri, _ in candidates]
    scores      = [s  for _,  s in candidates]
    rows        = [index[ri] for ri in row_indices]
    center_row  = rows[0]

    # ── Pairwise cosine similarity (embeddings already L2-normalised) ──────
    subset = emb[row_indices]                # (n, D)
    sim    = (subset @ subset.T).astype(float)  # (n, n), diag = 1.0

    # ── Edge accumulator ───────────────────────────────────────────────────
    edge_weights: dict[tuple[int, int], float] = {}

    def add_edge(i: int, j: int, w: float) -> None:
        if i == j:
            return
        key = (min(i, j), max(i, j))
        if w > edge_weights.get(key, -1.0):
            edge_weights[key] = w

    # Each node's neighbours, nearest first (used for mutual k-NN).
    neighbours = [
        sorted((j for j in range(n) if j != i), key=lambda j, _i=i: sim[_i, j], reverse=True)
        for i in range(n)
    ]
    topk = [set(neighbours[i][:KNN]) for i in range(n)]

    # ── 1) Mutual k-NN: connect i–j only when each is in the other's top-k ──
    #    Yields tight, meaningful clusters instead of hub-and-spoke spokes.
    for i in range(n):
        for j in topk[i]:
            if j > i and i in topk[j] and sim[i, j] >= EDGE_THRESHOLD:
                add_edge(i, j, float(sim[i, j]))

    # ── 2) Maximum-spanning-tree backbone (Prim's) ─────────────────────────
    #    Guarantees a single, cleanly connected constellation — no floating
    #    islands and no artificial centre burst.
    if n > 1:
        in_tree = [False] * n
        in_tree[0] = True
        best_w = [float(sim[0, j]) for j in range(n)]   # best weight linking j to the tree
        best_src = [0] * n
        for _ in range(n - 1):
            u = max((j for j in range(n) if not in_tree[j]),
                    key=lambda j: best_w[j], default=None)
            if u is None:
                break
            add_edge(best_src[u], u, float(sim[best_src[u], u]))
            in_tree[u] = True
            for j in range(n):
                if not in_tree[j] and sim[u, j] > best_w[j]:
                    best_w[j] = float(sim[u, j])
                    best_src[j] = u

    # ── Serialise ─────────────────────────────────────────────────────────
    # Per-result contract (Step 2 preview card):
    #   id, title, year, director, poster_url, rating, description,
    #   rationale, similarity_score, saved
    # Extra fields (genres, cast, keywords, original_title, score) feed the
    # constellation visuals and are not part of the card contract.
    nodes = [
        {
            "id":               str(rows[i]["tmdb_id"]),
            "title":            rows[i].get("title"),
            "original_title":   rows[i].get("original_title"),
            "year":             rows[i].get("year"),
            "director":         rows[i].get("director"),
            "poster_url":       _poster_url(rows[i].get("poster_path")),
            "rating":           rows[i].get("vote_average"),
            "runtime":          rows[i].get("runtime"),
            "description":      rows[i].get("overview") or "",
            "rationale":        _explain_node(rows[i], center_row, scores[i], i, ctx),
            "similarity_score": round(scores[i], 4),
            "saved":            False,   # no server-side user store yet (client localStorage)
            # ── constellation viz fields ──
            "genres":           rows[i].get("genres") or [],
            "cast":             rows[i].get("cast") or [],
            "keywords":         (rows[i].get("keywords") or [])[:25],
            "score":            round(scores[i], 4),
        }
        for i in range(n)
    ]
    # JSON can't represent NaN (and Starlette rejects it) — null out missing scalars.
    _nn = lambda v: None if isinstance(v, float) and v != v else v
    nodes = [{k: _nn(v) for k, v in node.items()} for node in nodes]

    links = [
        {
            "source": str(rows[mn]["tmdb_id"]),
            "target": str(rows[mx]["tmdb_id"]),
            "weight": round(w, 4),
        }
        for (mn, mx), w in edge_weights.items()
    ]

    return {"center": center_id, "nodes": nodes, "links": links}


def build_constellation_from_ids(ids: list[str], ctx_type: str = "saved") -> dict:
    """
    Build a constellation from an arbitrary set of tmdb ids (e.g. a user's
    saved films), with no search query. The most-voted film becomes the centre;
    each node's score is its cosine similarity to that centre, so closely
    related films sit nearer and shine brighter.
    """
    index, emb, id_to_row = load_data()

    rows_idx: list[int] = []
    seen: set[int] = set()
    for raw in ids:
        try:
            tid = int(raw)
        except (TypeError, ValueError):
            continue
        r = id_to_row.get(tid)
        if r is not None and r not in seen:
            seen.add(r)
            rows_idx.append(r)

    if not rows_idx:
        return {"center": None, "nodes": [], "links": []}

    # Centre = the most-voted film in the set (a recognisable anchor).
    center_row = max(rows_idx, key=lambda r: index[r].get("vote_count") or 0)
    cvec = emb[center_row]
    sims = emb[rows_idx] @ cvec  # cosine sim (vectors are L2-normalised)

    # Order candidates by similarity to centre (centre first, sim == 1.0).
    order = sorted(range(len(rows_idx)), key=lambda k: float(sims[k]), reverse=True)
    candidates = [(rows_idx[k], float(sims[k])) for k in order]

    center_id = str(index[center_row]["tmdb_id"])
    return build_constellation(center_id, candidates, search_context={"type": ctx_type})
