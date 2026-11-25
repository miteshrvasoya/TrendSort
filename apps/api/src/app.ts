import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { Db } from "@trendbridge/db";
import { CURRENT_VERSION } from "@trendbridge/shared";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Config } from "./config";
import { authRoutes } from "./routes/auth";
import { versionRoutes } from "./routes/versions";
import { economicsRoutes } from "./routes/economics";
import { giftRoutes } from "./routes/gifts";
import { marketRoutes } from "./routes/market";
import { importRoutes } from "./routes/import";
import { scoringRoutes } from "./routes/scoring";
import { sourceRoutes } from "./routes/sources";
import { verticalRoutes } from "./routes/verticals";
import { trendRoutes } from "./routes/trends";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: Config;
    authenticate: (req: import("fastify").FastifyRequest) => Promise<void>;
  }
}
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

export async function buildApp(opts: { db: Db; config: Config; logger?: boolean }) {
  const app = Fastify({ logger: opts.logger ?? false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("db", opts.db);
  app.decorate("config", opts.config);

  await app.register(cors, { origin: opts.config.WEB_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: opts.config.JWT_SECRET,
    cookie: { cookieName: "tb_token", signed: false },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: { info: { title: "TrendBridge API", version: "0.1.0" } },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.decorate("authenticate", async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
  });

  app.get("/health", async () => ({ ok: true, version: CURRENT_VERSION }));
  await app.register(authRoutes);
  await app.register(versionRoutes);
  await app.register(sourceRoutes);
  await app.register(importRoutes);
  await app.register(scoringRoutes);
  await app.register(giftRoutes);
  await app.register(economicsRoutes);
  await app.register(marketRoutes);
  await app.register(verticalRoutes);
  await app.register(trendRoutes);
  return app;
}
