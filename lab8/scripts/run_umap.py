import json
import csv
from pathlib import Path

import numpy as np
import umap


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def main():
    with (DATA / "bulletin_passages.csv").open(encoding="utf-8", newline="") as f:
        passages = list(csv.DictReader(f))
    embeddings = np.load(DATA / "lab8_embeddings.npy")
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=401,
    )
    coords = reducer.fit_transform(embeddings)
    with (DATA / "lab8_umap_coords.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["passage_id", "x", "y"])
        writer.writeheader()
        for row, xy in zip(passages, coords):
            writer.writerow({"passage_id": row["passage_id"], "x": float(xy[0]), "y": float(xy[1])})
    (DATA / "umap_audit.json").write_text(json.dumps({
        "umap_version": umap.__version__,
        "n_components": 2,
        "n_neighbors": 15,
        "min_dist": 0.15,
        "metric": "cosine",
        "random_state": 401,
        "coords_shape": list(coords.shape),
    }, indent=2), encoding="utf-8")
    print(coords.shape)


if __name__ == "__main__":
    main()
