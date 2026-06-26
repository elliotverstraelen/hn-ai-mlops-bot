import os
import time
import logging
import requests
import tweepy
import mlflow
import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM = "https://hacker-news.firebaseio.com/v0/item/{}.json"
HF_API_URL = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn"
MAX_ARTICLES = 5
TWEET_MAX_CHARS = 280


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def init_db():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS runs (
                    id SERIAL PRIMARY KEY,
                    mlflow_run_id TEXT,
                    started_at TIMESTAMPTZ DEFAULT NOW(),
                    articles_fetched INT DEFAULT 0,
                    tweets_posted INT DEFAULT 0,
                    avg_inference_seconds FLOAT DEFAULT 0,
                    total_inference_seconds FLOAT DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS articles (
                    id SERIAL PRIMARY KEY,
                    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    tweet_id TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)


def fetch_hn_articles(n: int = MAX_ARTICLES) -> list[dict]:
    ids = requests.get(HN_TOP_STORIES, timeout=10).json()[:n * 3]
    articles = []
    for story_id in ids:
        item = requests.get(HN_ITEM.format(story_id), timeout=10).json()
        if item and item.get("type") == "story" and item.get("title") and item.get("url"):
            articles.append({"title": item["title"], "url": item["url"]})
        if len(articles) >= n:
            break
    return articles


def summarize(title: str) -> str:
    headers = {"Authorization": f"Bearer {os.environ['HF_API_TOKEN']}"}
    payload = {
        "inputs": title,
        "parameters": {"max_length": 60, "min_length": 15, "do_sample": False},
    }
    for attempt in range(3):
        response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=30)
        if response.status_code == 503:
            wait = response.json().get("estimated_time", 20)
            logger.info(f"Model loading on HuggingFace, waiting {wait:.0f}s...")
            time.sleep(min(wait, 30))
            continue
        response.raise_for_status()
        return response.json()[0]["summary_text"]
    raise RuntimeError("HuggingFace API unavailable after retries")


def format_tweet(summary: str, url: str) -> str:
    suffix = f"\n{url}"
    max_summary = TWEET_MAX_CHARS - len(suffix) - 5
    if len(summary) > max_summary:
        summary = summary[:max_summary].rstrip() + "..."
    return f"{summary}{suffix}"


def get_twitter_client() -> tweepy.Client:
    return tweepy.Client(
        bearer_token=os.environ["TWITTER_BEARER_TOKEN"],
        consumer_key=os.environ["TWITTER_API_KEY"],
        consumer_secret=os.environ["TWITTER_API_SECRET"],
        access_token=os.environ["TWITTER_ACCESS_TOKEN"],
        access_token_secret=os.environ["TWITTER_ACCESS_TOKEN_SECRET"],
    )


def run():
    os.environ.setdefault("GIT_PYTHON_REFRESH", "quiet")
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "/app/mlruns"))
    mlflow.set_experiment("hn-ai-bot")

    twitter = get_twitter_client()
    db_enabled = "DATABASE_URL" in os.environ

    if db_enabled:
        init_db()

    with mlflow.start_run() as mlflow_run:
        mlflow_run_id = mlflow_run.info.run_id
        mlflow.log_param("model", "facebook/bart-large-cnn")
        mlflow.log_param("inference", "huggingface-api")
        mlflow.log_param("max_articles", MAX_ARTICLES)

        db_run_id = None
        if db_enabled:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO runs (mlflow_run_id) VALUES (%s) RETURNING id",
                        (mlflow_run_id,)
                    )
                    db_run_id = cur.fetchone()[0]

        logger.info("Fetching HN articles...")
        articles = fetch_hn_articles(MAX_ARTICLES)
        mlflow.log_metric("articles_fetched", len(articles))

        tweet_ids = []
        total_inference_time = 0.0

        for article in articles:
            logger.info(f"Summarizing: {article['title']}")
            t0 = time.time()
            summary = summarize(article["title"])
            elapsed = time.time() - t0
            total_inference_time += elapsed

            tweet_text = format_tweet(summary, article["url"])
            logger.info(f"Posting tweet ({len(tweet_text)} chars): {tweet_text[:60]}...")

            response = twitter.create_tweet(text=tweet_text)
            tweet_id = str(response.data["id"])
            tweet_ids.append(tweet_id)
            logger.info(f"Posted tweet {tweet_id}")

            if db_enabled and db_run_id:
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO articles (run_id, title, source_url, summary, tweet_id)
                               VALUES (%s, %s, %s, %s, %s)""",
                            (db_run_id, article["title"], article["url"], summary, tweet_id)
                        )

            time.sleep(2)

        avg_inference = total_inference_time / max(len(articles), 1)
        mlflow.log_metric("tweets_posted", len(tweet_ids))
        mlflow.log_metric("avg_inference_seconds", avg_inference)
        mlflow.log_metric("total_inference_seconds", total_inference_time)

        if db_enabled and db_run_id:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE runs SET articles_fetched=%s, tweets_posted=%s,
                           avg_inference_seconds=%s, total_inference_seconds=%s
                           WHERE id=%s""",
                        (len(articles), len(tweet_ids), avg_inference, total_inference_time, db_run_id)
                    )

        logger.info(f"Done. Posted {len(tweet_ids)} tweets.")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    interval = int(os.environ.get("RUN_INTERVAL_SECONDS", "21600"))
    while True:
        try:
            run()
        except Exception as e:
            logger.error(f"Run failed: {e}")
        logger.info(f"Sleeping {interval}s until next run...")
        time.sleep(interval)
