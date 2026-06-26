import os
import time
import logging
import requests
import tweepy
import mlflow
import psycopg2
from openai import OpenAI
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM = "https://hacker-news.firebaseio.com/v0/item/{}.json"
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
                    status TEXT DEFAULT 'running',
                    articles_fetched INT DEFAULT 0,
                    tweets_posted INT DEFAULT 0,
                    avg_inference_seconds FLOAT DEFAULT 0,
                    total_inference_seconds FLOAT DEFAULT 0
                );
                ALTER TABLE runs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running';
                UPDATE runs SET status = 'done'
                  WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes';
                CREATE TABLE IF NOT EXISTS articles (
                    id SERIAL PRIMARY KEY,
                    run_id INT REFERENCES runs(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    tweet_id TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS trigger_requests (
                    id SERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    processed BOOLEAN DEFAULT FALSE,
                    run_id INT REFERENCES runs(id)
                );
                ALTER TABLE trigger_requests ADD COLUMN IF NOT EXISTS run_id INT REFERENCES runs(id);
                UPDATE runs SET status = 'done'
                  WHERE status = 'pending' AND started_at < NOW() - INTERVAL '10 minutes';
            """)


def get_recently_tweeted_urls(db_enabled: bool) -> set:
    if not db_enabled:
        return set()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT source_url FROM articles WHERE created_at > NOW() - INTERVAL '12 hours'"
            )
            return {row[0] for row in cur.fetchall()}


def fetch_hn_articles(n: int = MAX_ARTICLES, skip_urls: set = None) -> list[dict]:
    skip_urls = skip_urls or set()
    ids = requests.get(HN_TOP_STORIES, timeout=10).json()[:n * 5]
    articles = []
    for story_id in ids:
        item = requests.get(HN_ITEM.format(story_id), timeout=10).json()
        if (item and item.get("type") == "story"
                and item.get("title") and item.get("url")
                and item["url"] not in skip_urls):
            articles.append({"title": item["title"], "url": item["url"]})
        if len(articles) >= n:
            break
    return articles


def summarize(title: str) -> str:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You write punchy, engaging tweets about tech news for a developer audience. "
                    "Given an article title, write a single tweet (no hashtags, no URL — that's added separately). "
                    "Max 200 characters. Be direct and interesting, not clickbait."
                ),
            },
            {"role": "user", "content": title},
        ],
        max_tokens=80,
        temperature=0.7,
    )
    return completion.choices[0].message.content.strip()


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


def run(existing_run_id=None):
    os.environ.setdefault("GIT_PYTHON_REFRESH", "quiet")
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "/app/mlruns"))
    mlflow.set_experiment("hn-ai-bot")

    twitter = get_twitter_client()
    db_enabled = "DATABASE_URL" in os.environ

    if db_enabled:
        init_db()

    with mlflow.start_run() as mlflow_run:
        mlflow_run_id = mlflow_run.info.run_id
        mlflow.log_param("model", "gpt-4o-mini")
        mlflow.log_param("inference", "openai-api")
        mlflow.log_param("max_articles", MAX_ARTICLES)

        db_run_id = None
        if db_enabled:
            with get_db() as conn:
                with conn.cursor() as cur:
                    if existing_run_id:
                        cur.execute(
                            "UPDATE runs SET mlflow_run_id=%s, status='running' WHERE id=%s RETURNING id",
                            (mlflow_run_id, existing_run_id)
                        )
                        db_run_id = existing_run_id
                    else:
                        cur.execute(
                            "INSERT INTO runs (mlflow_run_id, status) VALUES (%s, 'running') RETURNING id",
                            (mlflow_run_id,)
                        )
                        db_run_id = cur.fetchone()[0]

        logger.info("Fetching HN articles...")
        skip_urls = get_recently_tweeted_urls(db_enabled)
        articles = fetch_hn_articles(MAX_ARTICLES * 4, skip_urls)
        mlflow.log_metric("articles_fetched", len(articles))

        tweet_ids = []
        total_inference_time = 0.0

        for article in articles:
            if len(tweet_ids) >= MAX_ARTICLES:
                break
            logger.info(f"Summarizing: {article['title']}")
            t0 = time.time()
            summary = summarize(article["title"])
            elapsed = time.time() - t0
            total_inference_time += elapsed

            tweet_text = format_tweet(summary, article["url"])
            logger.info(f"Posting tweet ({len(tweet_text)} chars): {tweet_text[:60]}...")

            try:
                response = twitter.create_tweet(text=tweet_text)
            except tweepy.errors.Forbidden as e:
                logger.warning(f"Skipping tweet (forbidden — likely duplicate): {e}")
                if db_enabled and db_run_id:
                    with get_db() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                """INSERT INTO articles (run_id, title, source_url, summary, tweet_id)
                                   VALUES (%s, %s, %s, %s, %s)
                                   ON CONFLICT DO NOTHING""",
                                (db_run_id, article["title"], article["url"], summary, None)
                            )
                continue
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
                        """UPDATE runs SET status='done', articles_fetched=%s, tweets_posted=%s,
                           avg_inference_seconds=%s, total_inference_seconds=%s
                           WHERE id=%s""",
                        (len(articles), len(tweet_ids), avg_inference, total_inference_time, db_run_id)
                    )

        logger.info(f"Done. Posted {len(tweet_ids)} tweets.")


def consume_trigger(db_enabled: bool):
    """Returns run_id (int) if a trigger is pending, None otherwise."""
    if not db_enabled:
        return None
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE trigger_requests SET processed=TRUE WHERE id = "
                    "(SELECT id FROM trigger_requests WHERE processed=FALSE ORDER BY created_at LIMIT 1) "
                    "RETURNING run_id"
                )
                row = cur.fetchone()
                return row[0] if row else None
    except Exception:
        return None


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    interval = int(os.environ.get("RUN_INTERVAL_SECONDS", "21600"))
    db_enabled = "DATABASE_URL" in os.environ
    while True:
        try:
            run()
        except Exception as e:
            logger.error(f"Run failed: {e}")
        logger.info(f"Sleeping {interval}s until next run...")
        elapsed = 0
        poll = 30
        while elapsed < interval:
            time.sleep(poll)
            elapsed += poll
            triggered_run_id = consume_trigger(db_enabled)
            if triggered_run_id is not None:
                logger.info(f"Manual trigger received (run_id={triggered_run_id}) — running pipeline now.")
                try:
                    run(existing_run_id=triggered_run_id)
                except Exception as e:
                    logger.error(f"Triggered run failed: {e}")
                break
