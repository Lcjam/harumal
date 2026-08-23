import { createHash } from "node:crypto";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * 일반적인 `npm start`에서는 명시된 DATABASE_URL을 그대로 사용합니다.
 * Docker Compose에서는 DB 비밀번호를 앱 컨테이너에 넘기지 않으므로 APP_SECRET으로
 * 최소 권한 계정의 접속 문자열을 만들어 사용합니다.
 */
export function databaseUrlForRuntime(environment: RuntimeEnvironment): string {
  if (environment.DATABASE_URL) return environment.DATABASE_URL;

  const appSecret = required(environment, "APP_SECRET");
  const appDbUser = environment.APP_DB_USER ?? "harumal_app";
  const databaseName = environment.POSTGRES_DB ?? "harumal";
  const databaseHost = environment.DB_HOST ?? "db";
  const databasePort = environment.DB_PORT ?? "5432";
  const appDbPassword = createHash("sha256")
    .update(`${appSecret}:harumal-app-db-v1`, "utf8")
    .digest("hex");

  const databaseUrl = new URL("postgresql://db.invalid");
  databaseUrl.hostname = databaseHost;
  databaseUrl.port = databasePort;
  databaseUrl.username = appDbUser;
  databaseUrl.password = appDbPassword;
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}
