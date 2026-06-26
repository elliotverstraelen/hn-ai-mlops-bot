import os
import time
import logging
import requests
import tweepy
import mlflow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM = "https://hacker-news.firebaseio.com/v0/item/{}.json"
HF_API_URL = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn"
MAX_ARTICLES = 5
TWEET_MAX_CHARS = 280


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
            # Model is loading on HF side, wait and retry
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
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://mlflow:5000"))
    mlflow.set_experiment("hn-ai-bot")

    twitter = get_twitter_client()

    with mlflow.start_run():
        mlflow.log_param("model", "facebook/bart-large-cnn")
        mlflow.log_param("inference", "huggingface-api")
        mlflow.log_param("max_articles", MAX_ARTICLES)

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

            time.sleep(2)

        mlflow.log_metric("tweets_posted", len(tweet_ids))
        mlflow.log_metric("avg_inference_seconds", total_inference_time / max(len(articles), 1))
        mlflow.log_metric("total_inference_seconds", total_inference_time)

        logger.info(f"Done. Posted {len(tweet_ids)} tweets.")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    run()
