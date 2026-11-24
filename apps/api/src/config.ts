import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://postgres@localhost:5432/trendbridge"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_EMAIL: z.string().default("admin@trendbridge.local"),
  ADMIN_PASSWORD: z.string().default("admin123"),
  JWT_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  ANALYTICS_URL: z.string().default("http://localhost:8000"),
  NODE_ENV: z.string().default("development"),
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
