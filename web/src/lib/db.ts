import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Run {
  id: number;
  mlflow_run_id: string;
  started_at: string;
  status: string;
  articles_fetched: number;
  tweets_posted: number;
  avg_inference_seconds: number;
  total_inference_seconds: number;
}

export interface Article {
  id: number;
  run_id: number;
  title: string;
  source_url: string;
  summary: string;
  tweet_id: string;
  created_at: string;
}

function normalizeRun(row: Run): Run {
  let status = row.status ?? "done";
  // Treat runs stuck in 'running' for >30 min as 'done'
  if (status === "running") {
    const age = Date.now() - new Date(row.started_at).getTime();
    if (age > 30 * 60 * 1000) status = "done";
  }
  return {
    ...row,
    status,
    avg_inference_seconds: row.avg_inference_seconds ?? 0,
    total_inference_seconds: row.total_inference_seconds ?? 0,
    articles_fetched: row.articles_fetched ?? 0,
    tweets_posted: row.tweets_posted ?? 0,
  };
}

export async function getRuns(): Promise<Run[]> {
  const { rows } = await pool.query<Run>(
    "SELECT * FROM runs ORDER BY started_at DESC LIMIT 50"
  );
  return rows.map(normalizeRun);
}

export async function getRun(id: number): Promise<Run | null> {
  const { rows } = await pool.query<Run>(
    "SELECT * FROM runs WHERE id = $1",
    [id]
  );
  return rows[0] ? normalizeRun(rows[0]) : null;
}

export async function getArticles(runId: number): Promise<Article[]> {
  const { rows } = await pool.query<Article>(
    "SELECT * FROM articles WHERE run_id = $1 ORDER BY created_at ASC",
    [runId]
  );
  return rows;
}

export async function getStats(): Promise<{
  totalRuns: number;
  totalTweets: number;
  totalArticles: number;
  avgInference: number;
}> {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS "totalRuns",
      COALESCE(SUM(tweets_posted), 0)::int AS "totalTweets",
      COALESCE(SUM(articles_fetched), 0)::int AS "totalArticles",
      COALESCE(AVG(avg_inference_seconds), 0)::float AS "avgInference"
    FROM runs
  `);
  return rows[0];
}
