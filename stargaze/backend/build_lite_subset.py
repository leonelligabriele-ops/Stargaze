"""Create a smaller dataset for the free-tier (lite) deployment.

Reads data/index.json + data/embeddings.npy, keeps the top-N films by vote_count,
and writes data/index_lite.json + data/embeddings_lite.npy (row-aligned). Upload
those two as GitHub Release assets and point the FREE Render service's
INDEX_URL / EMBEDDINGS_URL at them.

Usage:
    python build_lite_subset.py [N]      # N defaults to 15000
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

DATA = Path(__file__).parent / "data"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 15000


def _vote(m: dict) -> float:
    v = m.get("vote_count")
    return v if isinstance(v, (int, float)) and v == v else 0


def main() -> None:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    emb = np.load(DATA / "embeddings.npy")
    if len(index) != len(emb):
        raise SystemExit(f"row mismatch: index={len(index)} emb={len(emb)}")

    keep = sorted(range(len(index)), key=lambda i: _vote(index[i]), reverse=True)[:N]
    keep.sort()                      # tidy ascending row order

    sub_index = [index[i] for i in keep]
    sub_emb = emb[keep]

    (DATA / "index_lite.json").write_text(json.dumps(sub_index), encoding="utf-8")
    np.save(DATA / "embeddings_lite.npy", sub_emb)

    mb = (DATA / "embeddings_lite.npy").stat().st_size / 1e6
    print(f"Wrote {len(sub_index)} films -> index_lite.json + embeddings_lite.npy "
          f"({mb:.0f} MB embeddings)")


if __name__ == "__main__":
    main()
