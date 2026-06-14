"""
Fetch a diverse ~20k-movie dataset from TMDB → data/movies.parquet.

Diversity: TMDB's discover endpoint caps at 500 pages (10k) per query, and a
single popularity sweep skews recent + US/English. So we union three sources:
  A) global popularity   (vote_count desc)
  B) per-year sweeps     (1940–2025) so older films are well represented
  C) per-country sweeps  (20 countries) for regional diversity
…then dedupe and cap at TARGET.

Richer per-movie fields: full credits (director + writers + 12 cast), keywords,
alternative titles, tagline, runtime, budget/revenue, release date, spoken
languages, production countries/companies, imdb id, poster/backdrop.

Concurrent detail fetch (thread pool). Resumable via checkpoint.parquet.

Usage:
    TMDB_API_KEY=<bearer_token> python build_dataset.py
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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

TARGET = 40000
WORKERS = 24
CHECKPOINT_EVERY = 2500

# Continent → pipe-joined ISO 3166-1 country codes (TMDB with_origin_country OR).
CONTINENT_COUNTRIES = {
    "Oceania": "AU|NZ|PG|FJ",
    "Africa":  "ZA|NG|EG|MA|KE|TN|DZ|SN|ET|GH|UG|ML|BF|CI|CM|ZW|AO|MZ",
    "Asia":    "JP|CN|HK|KR|TW|IN|TH|ID|PH|VN|MY|SG|PK|BD|LK|IR|IL|TR|SA|AE|LB|JO|KH|NP|MN|KZ|UZ|GE|AM|MM",
    "Europe":  "GB|FR|DE|IT|ES|BE|SE|IE|DK|CH|NL|NO|PL|AT|FI|PT|GR|CZ|HU|RO|IS|RU|UA|RS|HR|BG|SK|SI|EE|LT|LV|LU",
    "Americas": "US|CA|MX|BR|AR|CL|CO|PE|CU|UY|VE|BO|GT|EC|CR|DO|PR",
}
# Small continents first so, if the union exceeds TARGET, the cap trims the
# over-represented (Americas/Europe) rather than the scarce (Oceania/Africa).
CONTINENT_ORDER = ["Oceania", "Africa", "Asia", "Europe", "Americas"]

# TMDB genre id → name.
GENRES_TMDB = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
    878: "Science Fiction", 53: "Thriller", 10752: "War", 37: "Western",
}

_client = httpx.Client(headers=HEADERS, timeout=25,
                       limits=httpx.Limits(max_connections=WORKERS))


def get(url: str, params: dict | None = None, retries: int = 5) -> dict:
    for attempt in range(retries):
        try:
            r = _client.get(url, params=params)
            if r.status_code == 429:
                time.sleep(int(r.headers.get("Retry-After", 5)))
                continue
            if r.status_code == 404:
                return {}
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == retries - 1:
                return {}
            time.sleep(2 ** attempt)
    return {}


# ── ID gathering ────────────────────────────────────────────────────────────────
def discover_ids(params: dict, max_pages: int) -> list[int]:
    ids: list[int] = []
    for page in range(1, max_pages + 1):
        data = get(f"{BASE}/discover/movie", {**params, "page": page})
        results = data.get("results", [])
        if not results:
            break
        ids.extend(r["id"] for r in results)
        if page >= data.get("total_pages", 1):
            break
    return ids


def gather_ids() -> list[int]:
    """Stratified gather for balance across continent × genre and continent × decade."""
    if IDS_CACHE.exists():
        ids = json.loads(IDS_CACHE.read_text())
        print(f"Loaded {len(ids)} ids from cache", flush=True)
        return ids

    strata: list[tuple[dict, int]] = []
    for cont in CONTINENT_ORDER:
        codes = CONTINENT_COUNTRIES[cont]
        # continent × genre → balances continent + genre
        for gid in GENRES_TMDB:
            strata.append(({"with_origin_country": codes, "with_genres": gid,
                            "sort_by": "vote_count.desc", "vote_count.gte": 2}, 60))
        # continent × decade → balances year
        for d in range(1920, 2030, 10):
            strata.append(({"with_origin_country": codes,
                            "primary_release_date.gte": f"{d}-01-01",
                            "primary_release_date.lte": f"{d+9}-12-31",
                            "sort_by": "vote_count.desc", "vote_count.gte": 2}, 25))

    print(f"Gathering ids across {len(strata)} strata…", flush=True)
    results: list[list[int]] = [[] for _ in strata]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        fut = {pool.submit(discover_ids, p, pg): i for i, (p, pg) in enumerate(strata)}
        for f in tqdm(as_completed(fut), total=len(strata), desc="Strata"):
            results[fut[f]] = f.result()

    seen: dict[int, None] = {}            # dict preserves first-seen order
    for lst in results:                   # stratum order → small continents first
        for i in lst:
            seen.setdefault(i, None)
    print(f"   {len(seen)} unique ids from strata", flush=True)

    # Top up toward TARGET with a global popularity sweep if the strata fall short.
    if len(seen) < TARGET:
        for i in discover_ids({"sort_by": "vote_count.desc", "vote_count.gte": 8}, 500):
            seen.setdefault(i, None)
        print(f"   {len(seen)} after global top-up", flush=True)

    ids = list(seen.keys())[:TARGET]
    IDS_CACHE.write_text(json.dumps(ids))
    print(f"Total unique (capped at {TARGET}): {len(ids)}", flush=True)
    return ids


# ── Per-movie parsing ────────────────────────────────────────────────────────────
def _alt_titles(d: dict) -> list[str]:
    out, seen = [], set()
    for a in (d.get("alternative_titles", {}).get("titles") or []):
        t = (a.get("title") or "").strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
        if len(out) >= 12:
            break
    return out


def parse_movie(d: dict) -> dict:
    credits = d.get("credits", {})
    crew = credits.get("crew", [])
    director = next((c["name"] for c in crew if c.get("job") == "Director"), None)
    writers: list[str] = []
    for c in crew:
        if c.get("job") in ("Writer", "Screenplay", "Story") and c["name"] not in writers:
            writers.append(c["name"])
        if len(writers) >= 5:
            break
    dop = [c["name"] for c in crew if c.get("job") == "Director of Photography"][:2]
    producers: list[str] = []
    for job in ("Producer", "Executive Producer"):
        for c in crew:
            if c.get("job") == job and c["name"] not in producers:
                producers.append(c["name"])
    producers = producers[:3]
    cast = [c["name"] for c in credits.get("cast", [])[:12]]
    keywords = [k["name"] for k in d.get("keywords", {}).get("keywords", [])]
    genres = [g["name"] for g in d.get("genres", [])]
    countries = [c["name"] for c in d.get("production_countries", [])]
    spoken = [l.get("english_name") or l.get("name") for l in d.get("spoken_languages", [])]
    companies = [c["name"] for c in d.get("production_companies", [])][:6]
    rd = d.get("release_date") or ""
    year = int(rd[:4]) if rd[:4].isdigit() else None

    return {
        "tmdb_id": d["id"],
        "title": d.get("title"),
        "original_title": d.get("original_title"),
        "alt_titles": _alt_titles(d),
        "tagline": (d.get("tagline") or "").strip() or None,
        "year": year,
        "release_date": rd or None,
        "director": director,
        "writers": writers,
        "dop": dop,
        "producers": producers,
        "cast": cast,
        "genres": genres,
        "countries": countries,
        "spoken_languages": spoken,
        "production_companies": companies,
        "original_language": d.get("original_language"),
        "runtime": d.get("runtime") or None,
        "overview": d.get("overview") or "",
        "keywords": keywords,
        "vote_average": d.get("vote_average"),
        "vote_count": d.get("vote_count"),
        "popularity": d.get("popularity"),
        "budget": d.get("budget") or None,
        "revenue": d.get("revenue") or None,
        "imdb_id": d.get("imdb_id"),
        "poster_path": d.get("poster_path"),
        "backdrop_path": d.get("backdrop_path"),
        "adult": bool(d.get("adult")),
    }


def fetch_one(movie_id: int) -> dict | None:
    d = get(f"{BASE}/movie/{movie_id}",
            {"append_to_response": "credits,keywords,alternative_titles"})
    if not d or "id" not in d:
        return None
    return parse_movie(d)


def _normalise_lists(rows: list[dict]) -> list[dict]:
    """Convert any numpy-array list-columns (from a parquet round-trip) to lists."""
    for r in rows:
        for k, v in r.items():
            if hasattr(v, "tolist"):
                r[k] = v.tolist()
    return rows


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    ids = gather_ids()

    rows: list[dict] = []
    done: set[int] = set()
    if CHECKPOINT.exists():
        rows = _normalise_lists(pd.read_parquet(CHECKPOINT).to_dict("records"))
        done = {int(r["tmdb_id"]) for r in rows}
        print(f"Checkpoint: {len(done)} movies already fetched")
    elif OUT.exists():
        rows = _normalise_lists(pd.read_parquet(OUT).to_dict("records"))
        done = {int(r["tmdb_id"]) for r in rows}
        print(f"Reusing {len(done)} movies from existing {OUT.name}")

    todo = [i for i in ids if i not in done]
    print(f"Fetching details for {len(todo)} movies with {WORKERS} workers…", flush=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_one, i): i for i in todo}
        for n, fut in enumerate(tqdm(as_completed(futures), total=len(futures))):
            r = fut.result()
            if r:
                rows.append(r)
            if (n + 1) % CHECKPOINT_EVERY == 0:
                pd.DataFrame(rows).to_parquet(CHECKPOINT, index=False)

    df = pd.DataFrame(rows)
    df.to_parquet(OUT, index=False)
    if CHECKPOINT.exists():
        CHECKPOINT.unlink()
    print(f"\nDone. Saved {len(df)} movies -> {OUT}", flush=True)


if __name__ == "__main__":
    main()
