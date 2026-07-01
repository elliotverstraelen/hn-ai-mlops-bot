import os
import time
import logging
import requests
import tweepy
import mlflow
import psycopg2
from openai import OpenAI
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=__import__("sys").stdout)
logger = logging.getLogger(__name__)

HN_TOP_STORIES = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM = "https://hacker-news.firebaseio.com/v0/item/{}.json"
MAX_ARTICLES = 5
TWEET_MAX_CHARS = 280

GPT4O_MINI_INPUT_COST  = 0.150 / 1_000_000   # $ per token
GPT4O_MINI_OUTPUT_COST = 0.600 / 1_000_000


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
                ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_cost_usd FLOAT DEFAULT 0;
                ALTER TABLE runs ADD COLUMN IF NOT EXISTS avg_quality_score FLOAT DEFAULT 0;
                ALTER TABLE articles ADD COLUMN IF NOT EXISTS quality_score FLOAT;
            """)


def get_recently_tweeted_urls(db_enabled: bool) -> set:
    if not db_enabled:
        return set()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT source_url FROM articles WHERE tweet_id IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours'"
            )
            return {row[0] for row in cur.fetchall()}


def fetch_hn_articles(n: int = MAX_ARTICLES, skip_urls: set = None) -> list[dict]:
    skip_urls = skip_urls or set()
    ids = requests.get(HN_TOP_STORIES, timeout=10).json()[:100]
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


def summarize(title: str) -> tuple[str, int, int]:
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
    return (
        completion.choices[0].message.content.strip(),
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
    )


def rate_tweet(tweet_text: str) -> tuple[float, int, int]:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Rate this tweet for a developer audience 1-10. "
                    "Consider clarity, engagement, and informativeness. "
                    "Reply with only the number."
                ),
            },
            {"role": "user", "content": tweet_text},
        ],
        max_tokens=3,
        temperature=0,
    )
    try:
        score = float(completion.choices[0].message.content.strip())
    except ValueError:
        score = 5.0
    return score, completion.usage.prompt_tokens, completion.usage.completion_tokens


def format_tweet(summary: str, url: str) -> str:
    suffix = f"\n\nRead more → {url}"
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
        articles = fetch_hn_articles(MAX_ARTICLES, skip_urls)

        if not articles:
            logger.warning("No new articles found (all recent HN top stories already processed).")
            if db_enabled and db_run_id:
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE runs SET status='failed' WHERE id=%s", (db_run_id,))
            return

        tweet_ids = []
        total_inference_time = 0.0
        total_prompt_tokens = 0
        total_completion_tokens = 0
        total_cost_usd = 0.0
        quality_scores = []
        articles_processed = 0

        for article in articles:
            logger.info(f"Summarizing: {article['title']}")
            t0 = time.time()
            summary, p_tok, c_tok = summarize(article["title"])
            total_prompt_tokens += p_tok
            total_completion_tokens += c_tok
            total_cost_usd += p_tok * GPT4O_MINI_INPUT_COST + c_tok * GPT4O_MINI_OUTPUT_COST
            elapsed = time.time() - t0
            total_inference_time += elapsed
            articles_processed += 1

            tweet_text = format_tweet(summary, article["url"])

            q_score, qp_tok, qc_tok = rate_tweet(tweet_text)
            quality_scores.append(q_score)
            total_cost_usd += qp_tok * GPT4O_MINI_INPUT_COST + qc_tok * GPT4O_MINI_OUTPUT_COST
            logger.info(f"Quality score: {q_score}/10 ({len(tweet_text)} chars)")

            tweet_id = None
            try:
                response = twitter.create_tweet(text=tweet_text)
                tweet_id = str(response.data["id"])
                tweet_ids.append(tweet_id)
                logger.info(f"Posted tweet {tweet_id}")
            except Exception as e:
                logger.warning(f"Tweet not posted ({type(e).__name__}): {e}")

            if db_enabled and db_run_id:
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO articles (run_id, title, source_url, summary, tweet_id, quality_score)
                               VALUES (%s, %s, %s, %s, %s, %s)""",
                            (db_run_id, article["title"], article["url"], summary, tweet_id, q_score)
                        )
                        cur.execute(
                            """UPDATE runs SET articles_fetched=%s, tweets_posted=%s WHERE id=%s""",
                            (articles_processed, len(tweet_ids), db_run_id)
                        )

        avg_inference = total_inference_time / max(articles_processed, 1)
        avg_quality = sum(quality_scores) / max(len(quality_scores), 1)
        mlflow.log_metric("articles_fetched", articles_processed)
        mlflow.log_metric("tweets_posted", len(tweet_ids))
        mlflow.log_metric("avg_inference_seconds", avg_inference)
        mlflow.log_metric("total_inference_seconds", total_inference_time)
        mlflow.log_metric("total_prompt_tokens", total_prompt_tokens)
        mlflow.log_metric("total_completion_tokens", total_completion_tokens)
        mlflow.log_metric("total_cost_usd", round(total_cost_usd, 6))
        mlflow.log_metric("avg_quality_score", round(avg_quality, 2))
        logger.info(f"Cost: ${total_cost_usd:.4f} | Avg quality: {avg_quality:.1f}/10")

        if avg_quality < 5 and len(quality_scores) > 0:
            logger.warning(f"Quality gate: avg_quality_score={avg_quality:.1f} < 5.0")

        if db_enabled and db_run_id:
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE runs SET articles_fetched=%s, tweets_posted=%s,
                           avg_inference_seconds=%s, total_inference_seconds=%s,
                           total_cost_usd=%s, avg_quality_score=%s, status='done'
                           WHERE id=%s""",
                        (len(articles), len(tweet_ids), avg_inference, total_inference_time,
                         round(total_cost_usd, 6), round(avg_quality, 2), db_run_id)
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
