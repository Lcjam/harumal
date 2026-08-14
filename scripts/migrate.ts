import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool, withTransaction } from "../server/db.ts";

const migrationsDirectory = path.join(process.cwd(), "migrations");

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const alreadyApplied = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
    if (alreadyApplied.rowCount) continue;
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    });
    console.log(`Applied ${file}`);
  }
}

migrate()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
