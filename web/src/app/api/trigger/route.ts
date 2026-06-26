import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST() {
  await pool.query(
    "INSERT INTO trigger_requests (processed) VALUES (FALSE)"
  );
  return NextResponse.json({ ok: true });
}
