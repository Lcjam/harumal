import "dotenv/config";
import { z } from "zod";

const developmentSecret = "development-only-secret-change-before-production";
const strongSecretPattern = /^[a-f0-9]{64}$/i;

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgresql://harumal:harumal@localhost:5432/harumal"),
  APP_SECRET: z.string().min(32).default(developmentSecret),
  NEXT_PUBLIC_KAKAO_JS_KEY: z.string().optional().default(""),
  TZ: z.string().default("Asia/Seoul"),
});

export const config = schema.parse(process.env);

const publicUrl = new URL(config.PUBLIC_URL);
const isLoopbackPublicUrl = publicUrl.hostname === "localhost" || publicUrl.hostname === "127.0.0.1" || publicUrl.hostname === "[::1]";

if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== "/") {
  throw new Error("PUBLIC_URL은 경로, 쿼리, 인증정보가 없는 사이트 origin이어야 합니다.");
}

if (config.NODE_ENV === "production" && !isLoopbackPublicUrl) {
  if (publicUrl.protocol !== "https:") {
    throw new Error("운영 PUBLIC_URL은 HTTPS를 사용해야 합니다.");
  }
  if (!strongSecretPattern.test(config.APP_SECRET)) {
    throw new Error("운영 APP_SECRET은 openssl rand -hex 32로 생성한 64자리 비밀값이어야 합니다.");
  }

  const databaseUrl = new URL(config.DATABASE_URL);
  if (!databaseUrl.password || decodeURIComponent(databaseUrl.password).length < 24) {
    throw new Error("운영 데이터베이스 비밀번호는 24자 이상이어야 합니다.");
  }
} else if (config.NODE_ENV === "production" && config.APP_SECRET === developmentSecret) {
  throw new Error("운영 환경에서는 APP_SECRET을 반드시 변경해야 합니다.");
}

export const isProduction = config.NODE_ENV === "production";
export const publicOrigin = publicUrl.origin;
