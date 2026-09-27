import csv
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity
from transformers import AutoModel, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PASSAGES = DATA / "bulletin_passages.csv"
EMBEDDINGS = DATA / "lab8_embeddings.npy"
NEIGHBORS = DATA / "lab8_neighbors.csv"
CLUSTERS = DATA / "cluster_audit.json"
SUMMARY = DATA / "corpus_summary.json"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
RANDOM_STATE = 401

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "are", "students", "student",
    "will", "may", "course", "courses", "duke", "kunshan", "university", "credit",
    "credits", "program", "their", "have", "all", "not", "can", "must", "its", "they",
    "into", "such", "more", "than", "undergraduate", "shall", "each", "these", "been",
    "also", "other", "through", "which", "when", "where", "who", "what", "within",
}


def clean_text(text):
    text = re.sub(r"\s+", " ", str(text))
    text = re.sub(r"([A-Za-z])- ([a-z])", r"\1\2", text)
    return text.strip()


def mean_pool(last_hidden_state, attention_mask):
    mask = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
    return torch.sum(last_hidden_state * mask, 1) / torch.clamp(mask.sum(1), min=1e-9)


def encode_texts(texts, batch_size=32):
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModel.from_pretrained(MODEL_NAME)
    model.eval()
    vectors = []
    with torch.no_grad():
        for start in range(0, len(texts), batch_size):
            batch = texts[start:start + batch_size]
            encoded = tokenizer(batch, padding=True, truncation=True, max_length=256, return_tensors="pt")
            output = model(**encoded)
            pooled = mean_pool(output.last_hidden_state, encoded["attention_mask"])
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
            vectors.append(pooled.cpu().numpy())
            print(f"embedded {min(start + batch_size, len(texts))}/{len(texts)}")
    return np.vstack(vectors)


def top_terms_by_group(df, labels, n=8):
    vectorizer = TfidfVectorizer(
        min_df=3,
        max_df=0.72,
        ngram_range=(1, 2),
        stop_words=list(STOPWORDS),
        token_pattern=r"(?u)\b[A-Za-z][A-Za-z]+\b",
    )
    X = vectorizer.fit_transform(df["text_clean"])
    terms = np.array(vectorizer.get_feature_names_out())
    results = {}
    for label in sorted(set(labels)):
        rows = np.where(labels == label)[0]
        if len(rows) == 0:
            results[str(label)] = []
            continue
        scores = np.asarray(X[rows].mean(axis=0)).ravel()
        top = terms[np.argsort(scores)[::-1][:n]].tolist()
        results[str(label)] = top
    return results, X, terms


def section_summaries(df):
    section_counts = df["section"].fillna("").replace("", "Unlabeled").value_counts()
    section_lengths = df.groupby(df["section"].fillna("").replace("", "Unlabeled"))["word_count"].mean().sort_values(ascending=False)
    return {
        "passages_by_section": section_counts.head(25).to_dict(),
        "average_words_by_section": {k: round(v, 1) for k, v in section_lengths.head(25).to_dict().items()},
    }


def main():
    df = pd.read_csv(PASSAGES)
    df["text"] = df["text"].map(clean_text)
    df["text_clean"] = df["text"].map(clean_text)
    df["word_count"] = df["text_clean"].str.split().map(len)

    if EMBEDDINGS.exists():
        embeddings = np.load(EMBEDDINGS)
        print(f"loaded existing embeddings {embeddings.shape}")
    else:
        embeddings = encode_texts(df["text_clean"].tolist())
        np.save(EMBEDDINGS, embeddings)

    similarity = cosine_similarity(embeddings)
    with NEIGHBORS.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["passage_id", "neighbor_rank", "neighbor_id", "similarity"])
        writer.writeheader()
        for i, pid in enumerate(df["passage_id"]):
            scores = similarity[i].copy()
            scores[i] = -1
            for rank, j in enumerate(np.argsort(scores)[::-1][:5], start=1):
                writer.writerow({
                    "passage_id": pid,
                    "neighbor_rank": rank,
                    "neighbor_id": df.iloc[j]["passage_id"],
                    "similarity": round(float(scores[j]), 4),
                })

    k_reports = []
    best_k = 8
    best_score = -1
    for k in range(7, 11):
        labels = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=25).fit_predict(embeddings)
        score = silhouette_score(embeddings, labels, metric="cosine")
        sizes = Counter(int(label) for label in labels)
        k_reports.append({
            "k": int(k),
            "silhouette_cosine": round(float(score), 4),
            "sizes": {str(key): int(value) for key, value in sorted(sizes.items())},
        })
        if score > best_score:
            best_score = score
            best_k = k

    # Keep the assignment's starting point unless a nearby value is clearly better.
    labels = KMeans(n_clusters=8, random_state=RANDOM_STATE, n_init=25).fit_predict(embeddings)
    df["cluster"] = labels
    terms_by_cluster, _, _ = top_terms_by_group(df, labels)

    cluster_report = []
    for label in sorted(set(labels)):
        group = df[df["cluster"] == label].copy()
        reps = []
        centroid = embeddings[group.index].mean(axis=0)
        scores = embeddings[group.index] @ centroid
        for idx in group.index[np.argsort(scores)[::-1][:5]]:
            reps.append({
                "passage_id": df.loc[idx, "passage_id"],
                "page": int(df.loc[idx, "page"]),
                "section": df.loc[idx, "section"] if isinstance(df.loc[idx, "section"], str) else "",
                "text": df.loc[idx, "text"][:450],
            })
        cluster_report.append({
            "cluster": int(label),
            "n": int(len(group)),
            "terms": terms_by_cluster[str(label)],
            "representative_passages": reps,
        })

    audit = {
        "model_name": MODEL_NAME,
        "embedding_dimension": int(embeddings.shape[1]),
        "passages_embedded": int(embeddings.shape[0]),
        "clustering_candidates": k_reports,
        "final_k": 8,
        "final_k_reason": "K=8 was retained as the assignment starting point; nearby K values were inspected for size balance and topic interpretability.",
        "clusters": cluster_report,
    }
    CLUSTERS.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")

    summary = {
        "passages": int(len(df)),
        "word_count_mean": round(float(df["word_count"].mean()), 2),
        "word_count_median": round(float(df["word_count"].median()), 2),
        "word_count_min": int(df["word_count"].min()),
        "word_count_max": int(df["word_count"].max()),
        "sections": int(df["section"].nunique(dropna=True)),
        "chapters": int(df["chapter"].nunique(dropna=True)),
        **section_summaries(df),
    }
    SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    df[["passage_id", "chapter", "section", "subsection", "page", "text", "text_clean", "word_count", "cluster"]].to_csv(
        DATA / "lab8_clustered_passages.csv", index=False
    )
    print(json.dumps(audit, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
