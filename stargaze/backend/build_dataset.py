"""
Fetch top ~10,000 TMDB movies and save to data/movies.parquet.
Resumable: skips already-fetched IDs. Saves checkpoint every 500 movies.

Usage:
    TMDB_API_KEY=<bearer_token> python build_dataset.py
"""
import json
import os
import time
from pathlib import Path

import httpx
import pandas as pd
from tqdm import tqdm

TOKEN = os.environ["TMDB_API_KEY"]
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE = "https://api.themoviedb.org/3"

DATA_DIR = Path(__file__).parent / "data"
OUT = DATA_DIR / "movies.parquet"
CHECKPOINT = DATA_DIR / "checkpoint.parquet"
IDS_CACHE = DATA_DIR / "all_ids.json"

SLEEP = 0.05        # 20 req/s — well under TMDB's ~40/s limit
MAX_RETRIES = 5
CHECKPOINT_EVERY = 500
MAX_PAGES = 500     # TMDB caps discover at 500 pages × 20 = 10,000 movies


def get(url: str, params: dict | None = None, retries: int = MAX_RETRIES) -> dict:
    for attempt in range(retries):
        try:
            r = httpx.get(url, headers=HEADERS, params=params, timeout=20)
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 15))
                print(f"\nRate limited — sleeping {wait}s")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return {}


def fetch_all_ids() -> list[int]:
    """Fetch movie IDs from discover sorted by vote_count desc."""
    if IDS_CACHE.exists():
        ids = json.loads(IDS_CACHE.read_text())
        print(f"Loaded {len(ids)} IDs from cache")
        return ids

    ids: list[int] = []
    print("Fetching movie IDs from TMDB discover…")
    for page in tqdm(range(1, MAX_PAGES + 1), desc="Discover pages"):
        data = get(f"{BASE}/discover/movie", {
            "sort_by": "vote_count.desc",
            "vote_count.gte": 200,
            "page": page,
        })
        results = data.get("results", [])
        if not results:
            break
        ids.extend(r["id"] for r in results)
        if page >= data.get("total_pages", 1):
            break
        time.sleep(SLEEP)

    ids = list(dict.fromkeys(ids))  # deduplicate, preserve order
    IDS_CACHE.write_text(json.dumps(ids))
    print(f"Found {len(ids)} unique movie IDs")
    return ids


def parse_movie(detail: dict) -> dict:
    credits = detail.get("credits", {})
    director = next(
        (c["name"] for c in credits.get("crew", []) if c["job"] == "Director"),
        None,
    )
    cast = [c["name"] for c in credits.get("cast", [])[:5]]
    keywords = [k["name"] for k in detail.get("keywords", {}).get("keywords", [])]
    genres = [g["name"] for g in detail.get("genres", [])]
    countries = [c["name"] for c in detail.get("production_countries", [])]
    year = (detail.get("release_date") or "")[:4] or None

    return {
        "tmdb_id": detail["id"],
        "title": detail.get("title"),
        "original_title": detail.get("original_title"),
        "poster_path": detail.get("poster_path"),
        "year": int(year) if year and year.isdigit() else None,
        "director": director,
        "cast": cast,
        "genres": genres,
        "countries": countries,
        "original_language": detail.get("original_language"),
        "runtime": detail.get("runtime"),
        "overview": detail.get("overview") or "",
        "keywords": keywords,
        "vote_average": detail.get("vote_average"),
        "vote_count": detail.get("vote_count"),
        "popularity": detail.get("popularity"),
    }


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)

    # Load checkpoint
    rows: list[dict] = []
    done_ids: set[int] = set()
    if CHECKPOINT.exists():
        df_cp = pd.read_parquet(CHECKPOINT)
        rows = df_cp.to_dict("records")
        done_ids = {int(r["tmdb_id"]) for r in rows}
        print(f"Checkpoint: {len(done_ids)} movies already fetched")

    all_ids = fetch_all_ids()
    remaining = [i for i in all_ids if i not in done_ids]
    print(f"Remaining to fetch: {len(remaining)}")

    for i, movie_id in enumerate(tqdm(remaining, desc="Fetching details")):
        try:
            detail = get(
                f"{BASE}/movie/{movie_id}",
                {"append_to_response": "credits,keywords"},
            )
            rows.append(parse_movie(detail))
        except Exception as e:
            print(f"\nSkipping {movie_id}: {e}")

        time.sleep(SLEEP)

        if (i + 1) % CHECKPOINT_EVERY == 0:
            pd.DataFrame(rows).to_parquet(CHECKPOINT, index=False)
            print(f"\nCheckpoint: {len(rows)} movies saved")

    df = pd.DataFrame(rows)
    df.to_parquet(OUT, index=False)
    print(f"\nDone. Saved {len(df)} movies -> {OUT}")

    if CHECKPOINT.exists():
        CHECKPOINT.unlink()


if __name__ == "__main__":
    main()
