import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      "INSERT INTO runs (status) VALUES ('pending') RETURNING id"
    );
    const runId = rows[0].id;
    await client.query(
      "INSERT INTO trigger_requests (processed, run_id) VALUES (FALSE, $1)",
      [runId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, runId });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
