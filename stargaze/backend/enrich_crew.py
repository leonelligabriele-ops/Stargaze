"""
Backfill `dop` (Director of Photography) and `producers` into data/index.json
from TMDB credits, for a dataset built before those fields were captured.

Concurrent; results applied on the main thread so checkpoints are consistent.
Resumable: records that already have a `dop` field are skipped.

Usage:
    TMDB_API_KEY=<bearer_token> python enrich_crew.py
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
INDEX = Path(__file__).parent / "data" / "index.json"

WORKERS = 24
SAVE_EVERY = 2500

_client = httpx.Client(headers=HEADERS, timeout=20,
                       limits=httpx.Limits(max_connections=WORKERS))


def get_credits(movie_id: int) -> dict | None:
    for attempt in range(5):
        try:
            r = _client.get(f"{BASE}/movie/{movie_id}/credits")
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", 5)))
                continue
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == 4:
                return None
            time.sleep(2 ** attempt)
    return None


def extract(credits: dict) -> tuple[list[str], list[str]]:
    crew = credits.get("crew", [])
    dop = [c["name"] for c in crew if c.get("job") == "Director of Photography"][:2]
    producers: list[str] = []
    for job in ("Producer", "Executive Producer"):
        for c in crew:
            if c.get("job") == job and c["name"] not in producers:
                producers.append(c["name"])
    return dop, producers[:3]


def fetch(movie_id: int) -> tuple[list[str], list[str]]:
    c = get_credits(movie_id)
    return extract(c) if c else ([], [])


def main() -> None:
    if not INDEX.exists():
        raise SystemExit("data/index.json missing — run build_embeddings.py first")

    idx = json.load(open(INDEX, encoding="utf-8"))
    todo = [m for m in idx if "dop" not in m]
    print(f"{len(idx)} movies; {len(todo)} need crew", flush=True)
    if not todo:
        return

    def save():
        with open(INDEX, "w", encoding="utf-8") as f:
            json.dump(idx, f, ensure_ascii=False)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch, int(m["tmdb_id"])): m for m in todo}
        for n, fut in enumerate(tqdm(as_completed(futures), total=len(futures))):
            m = futures[fut]
            m["dop"], m["producers"] = fut.result()
            if (n + 1) % SAVE_EVERY == 0:
                save()

    save()
    have = sum(1 for m in idx if m.get("dop") or m.get("producers"))
    print(f"Done. {have}/{len(idx)} movies have crew now.", flush=True)


if __name__ == "__main__":
    main()
