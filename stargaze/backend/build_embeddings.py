"""
Build sentence embeddings for every movie and save to data/.

Model: BAAI/bge-small-en-v1.5

Text template (designed for atmospheric / conceptual queries):
  "{title} ({year}). A {genres} film from {countries} directed by {director}.
   Setting and atmosphere keywords: {keywords}. Plot: {overview}"

Outputs:
  data/embeddings.npy   — float32 (N, 384), L2-normalised
  data/index.json       — list of N dicts, row i -> movie metadata

Usage:
    python build_embeddings.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

DATA_DIR = Path(__file__).parent / "data"
MODEL_NAME = "BAAI/bge-small-en-v1.5"
BATCH_SIZE = 512  # bge-small is compact — large batches are fine

# Fallback: if the parquet still has ISO-3166-1 alpha-2 codes (old build_dataset.py),
# expand them to full names so queries like "japanese" or "korean" match correctly.
ISO_TO_NAME: dict[str, str] = {
    "US": "United States", "GB": "United Kingdom", "FR": "France",
    "DE": "Germany", "JP": "Japan", "KR": "South Korea", "IT": "Italy",
    "CN": "China", "IN": "India", "AU": "Australia", "CA": "Canada",
    "ES": "Spain", "MX": "Mexico", "BR": "Brazil", "RU": "Russia",
    "SE": "Sweden", "DK": "Denmark", "NO": "Norway", "FI": "Finland",
    "IR": "Iran", "AR": "Argentina", "HK": "Hong Kong", "TW": "Taiwan",
    "PL": "Poland", "NL": "Netherlands", "BE": "Belgium", "AT": "Austria",
    "CH": "Switzerland", "CZ": "Czech Republic", "HU": "Hungary",
    "RO": "Romania", "PT": "Portugal", "GR": "Greece", "TR": "Turkey",
    "TH": "Thailand", "PH": "Philippines", "ID": "Indonesia", "EG": "Egypt",
    "ZA": "South Africa", "NG": "Nigeria", "IL": "Israel", "SA": "Saudi Arabia",
    "NZ": "New Zealand", "SG": "Singapore", "MY": "Malaysia",
}

METADATA_FIELDS = [
    "tmdb_id", "title", "original_title", "alt_titles", "tagline",
    "year", "release_date", "director", "writers", "dop", "producers",
    "cast", "genres", "countries", "spoken_languages", "production_companies",
    "original_language", "runtime", "overview", "keywords",
    "vote_average", "vote_count", "popularity", "budget", "revenue",
    "imdb_id", "poster_path", "backdrop_path", "adult",
]


def _lst(val) -> list:
    """Normalise a column value to a plain Python list.

    Parquet list-columns can come back as numpy arrays (object dtype) when
    loaded via pandas+pyarrow. 'val or []' raises a ValueError on those,
    so we always convert explicitly.
    """
    if val is None:
        return []
    if hasattr(val, "tolist"):          # numpy array
        return val.tolist()
    try:
        return list(val)
    except TypeError:
        return []


def resolve_countries(raw: list[str]) -> list[str]:
    """Expand ISO-3166-1 alpha-2 codes to full names; pass full names through."""
    return [ISO_TO_NAME.get(c, c) for c in raw]


def _s(v) -> str:
    """Safe string: parquet stores missing scalars as NaN (a float)."""
    return v.strip() if isinstance(v, str) else ""


def make_text(row: dict) -> str:
    y        = row.get("year")
    year     = int(y) if isinstance(y, (int, float)) and y == y else ""
    title    = _s(row.get("title")) or "Unknown"
    genres   = ", ".join(_lst(row.get("genres")))   or "unknown genre"
    countries= ", ".join(resolve_countries(_lst(row.get("countries")))) or "unknown country"
    director = _s(row.get("director")) or "unknown director"
    cast     = ", ".join(_lst(row.get("cast"))[:6])
    tagline  = _s(row.get("tagline"))
    keywords = ", ".join(_lst(row.get("keywords")))   # all of them
    overview = _s(row.get("overview"))

    starring = f" starring {cast}" if cast else ""
    tag      = f" {tagline}." if tagline else ""

    return (
        f"{title} ({year}). "
        f"A {genres} film from {countries} directed by {director}{starring}.{tag} "
        f"Setting and atmosphere keywords: {keywords}. "
        f"Plot: {overview}"
    )


def _normalise_record(row: dict) -> dict:
    """Convert any numpy-array list-columns to plain Python lists in a metadata dict."""
    out = {}
    for k in METADATA_FIELDS:
        v = row.get(k)
        if v is not None and hasattr(v, "tolist"):
            v = v.tolist()
        out[k] = v
    return out


def main() -> None:
    movies_path = DATA_DIR / "movies.parquet"
    if not movies_path.exists():
        raise FileNotFoundError(f"{movies_path} not found — run build_dataset.py first")

    df = pd.read_parquet(movies_path)
    print(f"Loaded {len(df)} movies")

    records = df.to_dict("records")

    # Normalise list columns (numpy arrays -> plain lists) for both text and index
    records = [_normalise_record(r) for r in records]
    index   = records  # already contains only METADATA_FIELDS after normalisation

    texts = [make_text(row) for row in records]

    print(f"Sample text[0]:\n  {texts[0][:200]}\n")

    model = SentenceTransformer(MODEL_NAME)
    print(f"Encoding {len(texts)} movies with {MODEL_NAME}...")
    embeddings = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )

    emb_path = DATA_DIR / "embeddings.npy"
    idx_path = DATA_DIR / "index.json"

    np.save(emb_path, embeddings.astype("float32"))
    idx_path.write_text(json.dumps(index, ensure_ascii=False, default=str), encoding="utf-8")

    print(f"Saved embeddings {embeddings.shape} -> {emb_path}")
    print(f"Saved index ({len(index)} entries) -> {idx_path}")


if __name__ == "__main__":
    main()
