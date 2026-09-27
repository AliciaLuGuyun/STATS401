# Lab 8 - DKU Bulletin Semantic Explorer

## Source

- Bulletin title: Bulletin of Duke Kunshan University Undergraduate Instruction
- Academic year/version: 2021-2022
- Official source: https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf
- Date accessed: 2026-09-27
- Source PDF: https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf
- Local regeneration expects the PDF at `data/bulletin.pdf`; the deployed visualization uses the generated CSV/JSON files, so the source PDF is not required for GitHub Pages.

## Outputs

- `data/bulletin_passages.csv`: cleaned passage-level corpus with chapter, section, subsection, page, and text.
- `data/lab8_embedding_map.csv`: visualization-ready passage table with word count, cluster, topic label, and UMAP coordinates.
- `data/lab8_topic_section_matrix.csv`: topic by formal section counts and proportions.
- `data/lab8_neighbors.csv`: five nearest semantic neighbors per passage using cosine similarity in the original 384-dimensional embedding space.
- `data/*_audit.json`: extraction, clustering, UMAP, and dashboard audit summaries.

## Environment

PDF extraction uses the bundled Codex Python runtime:

```bash
/Users/guyunlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

Embedding and clustering use an existing local STATS401 virtual environment that already contains `torch`, `transformers`, `pandas`, `numpy`, and `scikit-learn`:

```bash
/Users/guyunlu/Documents/2026\ Fall/STATS401/LAB/.venv/bin/python
```

UMAP uses the project-local conda environment created for this lab:

```bash
lab8/.conda-umap/bin/python
```

Validated UMAP:

```text
umap-learn 0.5.12
synthetic smoke test output: (100, 2)
```

## Analysis Settings

- Embedding model: `sentence-transformers/all-MiniLM-L6-v2`
- Embedding dimension: 384
- Embedding text: cleaned passage text only, not metadata labels
- Similarity: cosine similarity in original embedding space
- UMAP: `n_components=2`, `n_neighbors=15`, `min_dist=0.15`, `metric="cosine"`, `random_state=401`
- Clustering: KMeans on original embedding vectors, `n_clusters=8`, `random_state=401`, `n_init=25`

Cluster labels were assigned after inspecting cluster sizes, characteristic TF-IDF terms, and representative passages in `data/cluster_audit.json`.

## Regenerate

From the repository root:

```bash
/Users/guyunlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 lab8/scripts/extract_bulletin.py
/Users/guyunlu/Documents/2026\ Fall/STATS401/LAB/.venv/bin/python lab8/scripts/semantic_analysis.py
/Users/guyunlu/Documents/ChatGPT/STATS401/lab8/.conda-umap/bin/python lab8/scripts/run_umap.py
/Users/guyunlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 lab8/scripts/finalize_outputs.py
```

## Serve Locally

From the repository root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/lab8/
```

## Notes

PDF extraction is heuristic because the source is a 400-page PDF with page headers, tables, course listings, and wrapped lines. The audit files document cleaned passage counts, duplicate removal, length distribution, missing metadata counts, cluster representatives, and UMAP settings.
