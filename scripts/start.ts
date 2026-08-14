import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const appSecret = required("APP_SECRET");
const appDbUser = process.env.APP_DB_USER ?? "harumal_app";
const databaseName = process.env.POSTGRES_DB ?? "harumal";
const databaseHost = process.env.DB_HOST ?? "db";
const databasePort = process.env.DB_PORT ?? "5432";
const appDbPassword = createHash("sha256")
  .update(`${appSecret}:harumal-app-db-v1`, "utf8")
  .digest("hex");

const databaseUrl = new URL("postgresql://db.invalid");
databaseUrl.hostname = databaseHost;
databaseUrl.port = databasePort;
databaseUrl.username = appDbUser;
databaseUrl.password = appDbPassword;
databaseUrl.pathname = `/${databaseName}`;

const childEnvironment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl.toString() };
delete childEnvironment.POSTGRES_PASSWORD;

async function run(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script], {
      env: childEnvironment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${signal ?? code}`));
    });
  });
}

await run("scripts/migrate.ts");
await run("server/index.ts");
