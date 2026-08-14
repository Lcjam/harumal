import pg from "pg";
import { config } from "./config.ts";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.NODE_ENV === "production" ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "harumal",
});

pool.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", event: "postgres_pool_error", message: error.message }));
});

export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}
