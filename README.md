# HN AI MLOps Bot

Automated Twitter/X bot that fetches top Hacker News articles, generates developer-audience tweets with GPT-4o-mini, and tracks every run as an MLflow experiment. Built as an end-to-end MLOps project for EHB — Erasmushogeschool Brussel.

**Live dashboard:** https://web-production-63167.up.railway.app

---

## What it does

Every 6 hours the bot:
1. Fetches the top 500 HN stories, filters to 20 unseen candidates
2. Skips any URL already tweeted in the last 24 hours (Postgres dedup)
3. Calls GPT-4o-mini to write a punchy developer tweet per article
4. Rates each tweet 1–10 (also GPT-4o-mini) and logs the score
5. Posts up to 5 tweets via the Twitter v2 API
6. Logs params, metrics and cost to MLflow + Postgres

---

## Architecture

![System Architecture](diagrams/01_architecture.png)

| Component | Role |
|---|---|
| **HN Firebase API** | Data source — top stories list |
| **OpenAI GPT-4o-mini** | Tweet generation + quality scoring |
| **Twitter v2 API (tweepy)** | Publishing |
| **MLflow** | Experiment tracking — params, metrics, run history |
| **PostgreSQL** | Persistent log of runs and articles |
| **Next.js dashboard** | Monitoring UI — run history, tweet output, quality scores |
| **Docker** | Containerisation (multi-stage Alpine build) |
| **Railway** | Cloud deployment, auto-deploy on git push |

---

## ML Pipeline

![ML Pipeline](diagrams/02_ml_pipeline.png)

**6 steps per run:**

1. **Data Ingestion** — fetch top 500 HN story IDs, pull item metadata for the first 100
2. **Deduplication** — query Postgres for URLs tweeted in the last 24 h; skip them
3. **Feature Extraction** — the article title is the model input (no scraping needed)
4. **Model Inference** — GPT-4o-mini with a developer-audience system prompt (`temp=0.7`, `max_tokens=80`)
5. **Post-processing** — trim to 275 chars, append `\n{url}`
6. **Publish + Log** — post tweet, rate it 1–10, write to Postgres, log metrics to MLflow

---

## CI/CD Pipeline

![CI/CD Pipeline](diagrams/03_cicd_pipeline.png)

`git push origin main` → GitHub webhook → Railway builds Docker image → zero-downtime container swap in `europe-west4`.

Tests run automatically on every push via GitHub Actions (`.github/workflows/test.yml`).

---

## MLOps Pillars

![MLOps Pillars](diagrams/04_mlops_pillars.png)

| Pillar | Implementation |
|---|---|
| **Data Pipeline** | HN Firebase API → dedup → 20-candidate pool |
| **ML Inference** | OpenAI GPT-4o-mini, configurable prompt |
| **Experiment Tracking** | MLflow — model, n_articles, tokens, cost, quality score |
| **Data Logging** | PostgreSQL `runs` + `articles` tables, 24 h rolling dedup |
| **Containerisation** | Multi-stage Dockerfile, `node:20-alpine` / `python:3.11-slim` |
| **CI/CD** | GitHub Actions (pytest) + Railway auto-deploy on push |
| **Monitoring** | Next.js dashboard — run history, tweet cards, quality badges |
| **Scheduling** | 6 h interval loop + manual trigger via dashboard |

---

## Metrics tracked per run (MLflow + Postgres)

| Metric | Description |
|---|---|
| `articles_fetched` | Candidates after dedup |
| `tweets_posted` | Successfully published tweets |
| `avg_inference_seconds` | Mean GPT latency per tweet |
| `total_inference_seconds` | Total GPT time for the run |
| `total_prompt_tokens` | Input tokens consumed |
| `total_completion_tokens` | Output tokens generated |
| `total_cost_usd` | API cost at GPT-4o-mini rates ($0.15/1M in, $0.60/1M out) |
| `avg_quality_score` | Mean self-evaluated tweet quality (1–10) |

---

## Challenges

Real production issues encountered and resolved during development:

**1. Wrong model for the task — BART vs GPT-4o-mini**
Initial model was `facebook/bart-large-cnn` — a document summariser. Given only a 5-word headline it hallucinated full sentences unrelated to the article. Root cause: model-input mismatch. A summariser needs a full document; a generative model can write from a headline. Replaced with GPT-4o-mini + a system prompt. Quality improved immediately.

**2. Unhandled network exception in retry loop**
HuggingFace serverless endpoints cold-start in 60–80 s. The retry logic caught HTTP 503 (`model loading`) but not Python's `requests.exceptions.Timeout`, which fires when a request hangs at the TCP layer. Every first run silently failed on article 1. Fix: explicitly catch `Timeout` in the retry loop alongside the HTTP status-code check.

**3. Twitter 403 duplicate content**
After switching models the bot ran cleanly — but Twitter rejected every tweet with 403 Forbidden: "duplicate content." The Postgres dedup only skips URLs already in the `articles` table with a `tweet_id`. These articles had been posted before the DB logging was added, so they weren't tracked. Fix: on a 403, write the article to the DB with `tweet_id = NULL` so future runs skip it. Also expanded the candidate pool from 5 to 100 story IDs to always have fresh material.

**4. Monorepo Dockerfile path in Railway**
The repo has a bot service and a web service. The web service had `rootDirectory: web` and `dockerfilePath: web/Dockerfile`. Railway resolves the Dockerfile path *relative to rootDirectory*, so it looked for `web/web/Dockerfile` — which doesn't exist. Every deploy failed silently at the build step. Fix: set `dockerfilePath: Dockerfile` so it resolves as `rootDirectory/Dockerfile`.

**5. MLflow persistence on ephemeral containers**
MLflow defaults to writing experiment data to the local filesystem (`/app/mlruns`). On Railway, containers are ephemeral — every redeploy wipes the history. Solution: run MLflow and Postgres in parallel. MLflow handles metric logging; Postgres provides durable persistence for the dashboard. Production-grade fix would be a hosted MLflow server with Postgres backend + S3 artifact storage.

---

## Project structure

```
.
├── bot/
│   ├── main.py              # Pipeline logic
│   ├── requirements.txt
│   └── tests/
│       └── test_bot.py      # Unit tests (9 tests)
├── web/
│   ├── src/app/             # Next.js 16 pages + API routes
│   ├── src/lib/db.ts        # Postgres query helpers
│   └── Dockerfile
├── diagrams/                # PNG diagrams for presentation
├── Dockerfile               # Bot container
├── .github/workflows/
│   └── test.yml             # CI — pytest on every push
└── docker-compose.yml       # Local dev
```

---

## Environment variables

| Variable | Service | Description |
|---|---|---|
| `OPENAI_API_KEY` | bot | GPT-4o-mini inference + scoring |
| `TWITTER_BEARER_TOKEN` | bot + web | Twitter v2 read access |
| `TWITTER_API_KEY` | bot + web | Twitter app consumer key |
| `TWITTER_API_SECRET` | bot + web | Twitter app consumer secret |
| `TWITTER_ACCESS_TOKEN` | bot + web | Twitter user access token |
| `TWITTER_ACCESS_TOKEN_SECRET` | bot + web | Twitter user access secret |
| `DATABASE_URL` | bot + web | Postgres connection string |
| `MLFLOW_TRACKING_URI` | bot | MLflow tracking server (default: `/app/mlruns`) |

See `.env.example` for a template.

---

## Running locally

```bash
cp .env.example .env   # fill in credentials
docker compose up
```

Dashboard runs at `http://localhost:3000`.
