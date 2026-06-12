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
import re
from collections import deque
from pathlib import Path
from typing import Optional

import numpy as np

DATA_DIR = Path(__file__).parent / "data"

_index: Optional[list[dict]] = None
_embeddings: Optional[np.ndarray] = None
_id_to_row: Optional[dict[int, int]] = None


def load_data() -> tuple[list[dict], np.ndarray, dict[int, int]]:
    global _index, _embeddings, _id_to_row

    if _index is not None:
        return _index, _embeddings, _id_to_row

    idx_path = DATA_DIR / "index.json"
    emb_path = DATA_DIR / "embeddings.npy"

    if not idx_path.exists():
        raise RuntimeError("data/index.json missing — run build_embeddings.py first")
    if not emb_path.exists():
        raise RuntimeError("data/embeddings.npy missing — run build_embeddings.py first")

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


def _explain_node(
    row: dict,
    center: dict,
    score: float,
    rank: int,
    ctx: dict,
) -> str:
    """One-sentence reason this movie appears in the results."""
    q_type   = ctx.get("type", "semantic")
    query    = (ctx.get("query") or "").lower()
    dir_name = ctx.get("director_name") or ""

    # ── centre movie ──────────────────────────────────────────────────────
    if rank == 0:
        if q_type == "title":
            return "Exact title match"
        if q_type == "director":
            return f"Most popular film by {dir_name}"
        return "Closest match to your search"

    # ── every film by the searched director ───────────────────────────────
    if q_type == "director" and row.get("director") == dir_name:
        return f"Also directed by {dir_name}"

    # ── shares director with the centre ───────────────────────────────────
    if row.get("director") and row["director"] == center.get("director"):
        return f"Also directed by {row['director']}"

    # ── shares cast members with the centre ───────────────────────────────
    cast_shared = sorted(
        set(center.get("cast") or []) & set(row.get("cast") or [])
    )
    if cast_shared:
        return (
            f"Features {cast_shared[0]}, "
            f"who also stars in {center.get('title', 'the central film')}"
        )

    # ── for keyword/semantic queries: match country or keywords to query ──
    if q_type == "semantic" and query:
        for country in (row.get("countries") or []):
            if country.lower() in query:
                genres = row.get("genres") or []
                genre  = genres[0].lower() if genres else "film"
                return f"A {country} {genre} matching your search"
        q_tokens = {t for t in re.split(r"[,\s]+", query) if len(t) > 3}
        for kw in (row.get("keywords") or [])[:15]:
            if any(t in kw.lower() for t in q_tokens):
                return f"Linked by '{kw}'"

    # ── shared genres with the centre ─────────────────────────────────────
    shared_g = sorted(
        set(center.get("genres") or []) & set(row.get("genres") or [])
    )
    if shared_g:
        label = " & ".join(shared_g[:2])
        return (
            f"Closely related {label} film"
            if score >= 0.82
            else f"Similar {label} themes"
        )

    # ── fallback ──────────────────────────────────────────────────────────
    return (
        "Closely matches your search"
        if score >= 0.80
        else "Thematically related to your search"
    )


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
    adj: list[set[int]] = [set() for _ in range(n)]
    edge_weights: dict[tuple[int, int], float] = {}

    def add_edge(i: int, j: int, w: float) -> None:
        key = (min(i, j), max(i, j))
        if w > edge_weights.get(key, -1.0):
            edge_weights[key] = w
        adj[i].add(j)
        adj[j].add(i)

    # ── Rule 1: each node → top-3 peers, threshold 0.45 ──────────────────
    for i in range(n):
        peers = sorted(
            (j for j in range(n) if j != i),
            key=lambda j, _i=i: sim[_i, j],
            reverse=True,
        )
        for j in peers[:3]:
            if sim[i, j] >= 0.45:
                add_edge(i, j, float(sim[i, j]))

    # ── Rule 2: center → top-5 peers, no threshold ────────────────────────
    center_peers = sorted(
        (j for j in range(n) if j != 0),
        key=lambda j: sim[0, j],
        reverse=True,
    )
    for j in center_peers[:5]:
        add_edge(0, j, float(sim[0, j]))

    # ── Rule 3: bridge disconnected components to center ──────────────────
    components = _bfs_components(n, adj)
    if len(components) > 1:
        center_members = set(next(c for c in components if 0 in c))
        for comp in components:
            if any(node in center_members for node in comp):
                continue
            # Pick the node in this component closest to the center
            bridge = max(comp, key=lambda i: sim[0, i])
            add_edge(0, bridge, float(sim[0, bridge]))

    # ── Serialise ─────────────────────────────────────────────────────────
    nodes = [
        {
            "id":            str(rows[i]["tmdb_id"]),
            "title":         rows[i].get("title"),
            "original_title":rows[i].get("original_title"),
            "year":          rows[i].get("year"),
            "director":      rows[i].get("director"),
            "genres":        rows[i].get("genres") or [],
            "cast":          rows[i].get("cast") or [],
            "keywords":      (rows[i].get("keywords") or [])[:10],
            "overview":      rows[i].get("overview") or "",
            "vote_average":  rows[i].get("vote_average"),
            "score":         round(scores[i], 4),
            "explanation":   _explain_node(rows[i], center_row, scores[i], i, ctx),
        }
        for i in range(n)
    ]

    links = [
        {
            "source": str(rows[mn]["tmdb_id"]),
            "target": str(rows[mx]["tmdb_id"]),
            "weight": round(w, 4),
        }
        for (mn, mx), w in edge_weights.items()
    ]

    return {"center": center_id, "nodes": nodes, "links": links}
