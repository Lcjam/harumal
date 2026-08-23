import { spawn } from "node:child_process";
import { databaseUrlForRuntime } from "./runtime-database.ts";

const childEnvironment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrlForRuntime(process.env) };
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
