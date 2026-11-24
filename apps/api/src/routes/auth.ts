import { users } from "@trendbridge/db";
import { loginSchema } from "@trendbridge/shared";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/login",
    { schema: { body: loginSchema }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { email, password } = req.body;
      const [u] = await app.db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      const ok = u ? await bcrypt.compare(password, u.passwordHash) : false;
      if (!u || !ok) return reply.code(401).send({ error: "Invalid email or password" });
      const token = app.jwt.sign({ sub: u.id, email: u.email }, { expiresIn: "7d" });
      reply.setCookie("tb_token", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 86400,
      });
      return { ok: true, email: u.email, token };
    },
  );

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie("tb_token", { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (req) => {
    const [u] = await app.db.select().from(users).where(eq(users.id, req.user.sub)).limit(1);
    if (!u) return { email: req.user.email };
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      lastSeenVersion: u.lastSeenVersion,
      tourCompletedVersion: u.tourCompletedVersion,
    };
  });
};
