"""
Backfill `poster_path` into data/index.json for an already-built dataset.

The original build_dataset.py run did not store poster paths, so the search
API returns poster_url=None and the frontend falls back to a placeholder.
This script fetches just the poster_path for each movie from TMDB and writes
it back into index.json (in place).

Concurrent (thread pool) — TMDB calls are latency-bound, so a single thread
manages only ~2 req/s; with a pool we reach ~30 req/s and finish in minutes.
Resumable: records that already have a poster_path are skipped.

Usage:
    TMDB_API_KEY=<bearer_token> python enrich_posters.py
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx
from tqdm import tqdm

TOKEN = os.environ["TMDB_API_KEY"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE = "https://api.themoviedb.org/3"

DATA_DIR = Path(__file__).parent / "data"
INDEX = DATA_DIR / "index.json"

WORKERS = 16          # concurrent requests (well under TMDB's ~50/s limit)
SAVE_EVERY = 500      # checkpoint to disk every N completed fetches

_client = httpx.Client(headers=HEADERS, timeout=20, limits=httpx.Limits(max_connections=WORKERS))


def get_poster_path(movie_id: int) -> str | None:
    for attempt in range(5):
        try:
            r = _client.get(f"{BASE}/movie/{movie_id}")
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 5))
                time.sleep(wait)
                continue
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json().get("poster_path")
        except Exception:
            if attempt == 4:
                return None
            time.sleep(2 ** attempt)
    return None


def main() -> None:
    if not INDEX.exists():
        raise SystemExit("data/index.json missing — run build_embeddings.py first")

    with open(INDEX, encoding="utf-8") as f:
        index = json.load(f)

    todo = [m for m in index if not m.get("poster_path")]
    print(f"{len(index)} movies total; {len(todo)} need a poster_path", flush=True)
    if not todo:
        return

    def save() -> None:
        with open(INDEX, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False)

    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(get_poster_path, int(m["tmdb_id"])): m for m in todo}
        for fut in tqdm(as_completed(futures), total=len(futures), desc="Fetching posters"):
            futures[fut]["poster_path"] = fut.result()
            done += 1
            if done % SAVE_EVERY == 0:
                save()

    save()
    have = sum(1 for m in index if m.get("poster_path"))
    print(f"Done. {have}/{len(index)} movies now have a poster_path.", flush=True)


if __name__ == "__main__":
    main()
