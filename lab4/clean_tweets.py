"""Clean airline tweets and create RoBERTa sentiment data for Lab 4."""

from pathlib import Path
import re

import nltk
import pandas as pd
import requests
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer
from transformers import pipeline

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SOURCE_URL = (
    "https://raw.githubusercontent.com/satyajeetkrjha/"
    "kaggle-Twitter-US-Airline-Sentiment-/master/Tweets.csv"
)
SOURCE_FILE = DATA_DIR / "lab4_source_tweets.csv"
RAW_FILE = DATA_DIR / "lab4_raw_tweets.csv"
CLEAN_FILE = DATA_DIR / "lab4_clean_tweets.csv"
SUMMARY_FILE = DATA_DIR / "lab4_sentiment_by_airline.csv"
TERMS_FILE = DATA_DIR / "lab4_top_terms.csv"
SAMPLE_SIZE = 1200
LOCAL_MODEL = ROOT / ".models" / "twitter-roberta-base-sentiment-latest"


def download_source():
    """Download the public source data once and retain the original file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SOURCE_FILE.exists():
        print(f"Using existing source file: {SOURCE_FILE}")
        return
    response = requests.get(
        SOURCE_URL,
        headers={"User-Agent": "STATS401-Lab4/1.0"},
        timeout=90,
    )
    response.raise_for_status()
    SOURCE_FILE.write_bytes(response.content)
    print(f"Downloaded source data to {SOURCE_FILE}")


def download_nltk_resources():
    """Ensure the small NLTK language resources are available."""
    resources = {
        "punkt": "tokenizers/punkt",
        "punkt_tab": "tokenizers/punkt_tab",
        "stopwords": "corpora/stopwords",
        "wordnet": "corpora/wordnet",
        "omw-1.4": "corpora/omw-1.4",
    }
    for resource, path in resources.items():
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(resource, quiet=True)


def normalize_tweet(text):
    text = str(text).lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    return re.sub(r"\s+", " ", text).strip()


def prepare_for_roberta(text):
    text = re.sub(r"@\w+", "@user", str(text))
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def clean_and_sample():
    source = pd.read_csv(SOURCE_FILE)
    print("Source shape:", source.shape)
    print("Missing values in useful fields:")
    print(source[["tweet_id", "tweet_created", "airline", "retweet_count", "text"]].isna().sum())

    useful = source[["tweet_id", "tweet_created", "airline", "retweet_count", "text"]].copy()
    useful = useful.dropna(subset=["tweet_id", "text", "airline"])
    useful = useful.drop_duplicates(subset=["tweet_id"], keep="first")
    if len(useful) < SAMPLE_SIZE:
        raise RuntimeError(f"Only {len(useful)} usable tweets were found.")

    raw = useful.sample(n=SAMPLE_SIZE, random_state=401).sort_values("tweet_id")
    raw.to_csv(RAW_FILE, index=False)

    data = raw.copy()
    data["tweet_id"] = pd.to_numeric(data["tweet_id"], errors="coerce")
    data["retweet_count"] = pd.to_numeric(
        data["retweet_count"], errors="coerce"
    ).fillna(0).clip(lower=0).astype(int)
    data["created_at"] = pd.to_datetime(
        data["tweet_created"], errors="coerce", utc=True
    )
    data = data.dropna(subset=["tweet_id", "created_at"])
    data["airline"] = data["airline"].astype("string").str.strip()
    data["tweet_text_raw"] = (
        data["text"].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
    )
    data["date"] = data["created_at"].dt.strftime("%Y-%m-%d")
    data["hour"] = data["created_at"].dt.hour
    data["weekday"] = data["created_at"].dt.day_name()
    data["text_normalized"] = data["tweet_text_raw"].apply(normalize_tweet)

    stop_words = set(stopwords.words("english"))
    lemmatizer = WordNetLemmatizer()

    def preprocess(text):
        tokens = word_tokenize(text)
        return " ".join(
            lemmatizer.lemmatize(token)
            for token in tokens
            if token.isalpha() and token not in stop_words
        )

    data["text_clean"] = data["text_normalized"].apply(preprocess)
    data["sentiment_text"] = data["tweet_text_raw"].apply(prepare_for_roberta)
    print("Cleaned rows:", len(data))
    return data


def calculate_tfidf(data):
    vectorizer = TfidfVectorizer(min_df=2, max_df=0.90)
    matrix = vectorizer.fit_transform(data["text_clean"])
    terms = pd.DataFrame({
        "term": vectorizer.get_feature_names_out(),
        "mean_tfidf": matrix.mean(axis=0).A1,
    }).sort_values("mean_tfidf", ascending=False).head(30)
    terms.to_csv(TERMS_FILE, index=False)
    print("TF-IDF matrix shape:", matrix.shape)


def calculate_sentiment(data):
    model_name = str(LOCAL_MODEL) if LOCAL_MODEL.exists() else (
        "cardiffnlp/twitter-roberta-base-sentiment-latest"
    )
    model = pipeline(
        "sentiment-analysis",
        model=model_name,
        top_k=None,
    )
    results = model(
        data["sentiment_text"].tolist(),
        truncation=True,
        max_length=512,
        batch_size=16,
    )
    score_dicts = [
        {item["label"].lower(): item["score"] for item in scores}
        for scores in results
    ]
    for label in ["negative", "neutral", "positive"]:
        data[f"sentiment_{label}"] = [scores.get(label, 0.0) for scores in score_dicts]
    data["sentiment"] = [
        max(scores, key=scores.get).capitalize() for scores in score_dicts
    ]
    data["sentiment_score"] = data["sentiment_positive"] - data["sentiment_negative"]
    return data


def save_outputs(data):
    columns = [
        "tweet_id", "created_at", "date", "hour", "weekday", "airline",
        "tweet_text_raw", "text_clean", "retweet_count", "sentiment",
        "sentiment_score", "sentiment_negative", "sentiment_neutral",
        "sentiment_positive",
    ]
    data[columns].to_csv(CLEAN_FILE, index=False)
    summary = data.groupby(["airline", "sentiment"]).size().reset_index(name="count")
    totals = summary.groupby("airline")["count"].transform("sum")
    summary["percentage"] = summary["count"] / totals * 100
    summary.to_csv(SUMMARY_FILE, index=False)
    print(f"Saved {len(data)} cleaned tweets to {CLEAN_FILE}")
    print("Sentiment counts:")
    print(data["sentiment"].value_counts())


def main():
    download_source()
    download_nltk_resources()
    data = clean_and_sample()
    calculate_tfidf(data)
    data = calculate_sentiment(data)
    save_outputs(data)


if __name__ == "__main__":
    main()
