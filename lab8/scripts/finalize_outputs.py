import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

CLUSTER_NAMES = {
    0: "Physical Education and Wellness",
    1: "Curriculum Requirements and Course Choices",
    2: "Credit Transfer and Academic Procedures",
    3: "Media, Writing, and Arts",
    4: "STEM and Quantitative Methods",
    5: "Policy, Economics, and Environment",
    6: "Chinese Language and China Studies",
    7: "Global Humanities and Social Sciences",
}


def main():
    passages = pd.read_csv(DATA / "lab8_clustered_passages.csv")
    coords = pd.read_csv(DATA / "lab8_umap_coords.csv")
    neighbors = pd.read_csv(DATA / "lab8_neighbors.csv")

    passages["cluster_name"] = passages["cluster"].map(CLUSTER_NAMES)
    merged = passages.merge(coords, on="passage_id", how="left")
    required = [
        "passage_id", "chapter", "section", "subsection", "page", "text",
        "word_count", "cluster", "cluster_name", "x", "y",
    ]
    merged[required].to_csv(DATA / "lab8_embedding_map.csv", index=False)

    section_totals = merged.groupby("section").size().rename("section_total")
    matrix = merged.groupby(["section", "cluster_name"]).size().rename("count").reset_index()
    matrix = matrix.merge(section_totals, on="section")
    matrix["proportion"] = matrix["count"] / matrix["section_total"]
    matrix.to_csv(DATA / "lab8_topic_section_matrix.csv", index=False)

    topic_counts = merged["cluster_name"].value_counts().rename_axis("cluster_name").reset_index(name="count")
    topic_counts.to_csv(DATA / "lab8_topic_counts.csv", index=False)

    section_summary = merged.groupby("section").agg(
        count=("passage_id", "count"),
        average_words=("word_count", "mean"),
        topic_count=("cluster_name", "nunique"),
    ).reset_index().sort_values(["count", "topic_count"], ascending=False)
    section_summary["average_words"] = section_summary["average_words"].round(1)
    section_summary.to_csv(DATA / "lab8_section_summary.csv", index=False)

    search_terms = ["credit", "graduation", "registration", "academic integrity"]
    search_summary = {}
    text_lower = merged["text"].str.lower()
    for term in search_terms:
        mask = text_lower.str.contains(term, regex=False)
        search_summary[term] = {
            "matches": int(mask.sum()),
            "topics": merged.loc[mask, "cluster_name"].value_counts().to_dict(),
            "sections": merged.loc[mask, "section"].value_counts().head(8).to_dict(),
        }

    cross_topic_sections = matrix.groupby("section").agg(
        passages=("count", "sum"),
        topics=("cluster_name", "nunique"),
    ).reset_index().sort_values(["topics", "passages"], ascending=False).head(12)

    stats = {
        "cluster_names": CLUSTER_NAMES,
        "topic_counts": topic_counts.to_dict(orient="records"),
        "top_sections": section_summary.head(20).to_dict(orient="records"),
        "most_semantically_diverse_sections": cross_topic_sections.to_dict(orient="records"),
        "search_summary": search_summary,
        "neighbors_example": neighbors.merge(
            merged[["passage_id", "section", "cluster_name", "text"]],
            left_on="neighbor_id",
            right_on="passage_id",
            suffixes=("", "_neighbor"),
        ).head(15).to_dict(orient="records"),
    }
    (DATA / "lab8_dashboard_stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(stats, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
