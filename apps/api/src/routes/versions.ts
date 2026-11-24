import { appVersions, releaseNotes, users } from "@trendbridge/db";
import {
  compareVersions,
  CURRENT_VERSION,
  markSeenSchema,
  stepsFor,
  TOUR_STEPS,
} from "@trendbridge/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export const versionRoutes: FastifyPluginAsyncZod = async (app) => {
  const all = async () =>
    app.db
      .select({
        version: appVersions.version,
        releasedOn: appVersions.releasedOn,
        title: appVersions.title,
        summary: appVersions.summary,
        added: releaseNotes.added,
        changed: releaseNotes.changed,
        fixed: releaseNotes.fixed,
        removed: releaseNotes.removed,
        forYou: releaseNotes.forYou,
      })
      .from(appVersions)
      .innerJoin(releaseNotes, eq(releaseNotes.version, appVersions.version))
      .orderBy(desc(appVersions.releasedOn), desc(appVersions.version));

  app.get("/versions", { preHandler: app.authenticate }, async () => ({
    current: CURRENT_VERSION,
    versions: await all(),
  }));

  /** Notes the user has not seen yet, for the What's New modal. */
  app.get("/versions/whats-new", { preHandler: app.authenticate }, async (req) => {
    const [u] = await app.db.select().from(users).where(eq(users.id, req.user.sub)).limit(1);
    const since = u?.lastSeenVersion ?? null;
    const versions = (await all())
      .filter((v) => !since || compareVersions(v.version, since) > 0)
      .sort((a, b) => compareVersions(b.version, a.version));
    return { current: CURRENT_VERSION, since, isFirstVisit: !since, versions };
  });

  app.post(
    "/versions/seen",
    { preHandler: app.authenticate, schema: { body: markSeenSchema } },
    async (req) => {
      await app.db
        .update(users)
        .set({ lastSeenVersion: req.body.version })
        .where(eq(users.id, req.user.sub));
      return { ok: true };
    },
  );

  /** ?mode=full for new users / replay, otherwise only steps newer than the last completed tour. */
  app.get(
    "/tour",
    {
      preHandler: app.authenticate,
      schema: { querystring: z.object({ mode: z.enum(["full", "changes"]).default("changes") }) },
    },
    async (req) => {
      const [u] = await app.db.select().from(users).where(eq(users.id, req.user.sub)).limit(1);
      const steps = stepsFor({
        sinceVersion: u?.tourCompletedVersion ?? null,
        all: req.query.mode === "full",
      });
      return {
        current: CURRENT_VERSION,
        steps,
        total: TOUR_STEPS.length,
        tourCompletedVersion: u?.tourCompletedVersion ?? null,
      };
    },
  );

  app.post("/tour/complete", { preHandler: app.authenticate }, async (req) => {
    await app.db
      .update(users)
      .set({ tourCompletedVersion: CURRENT_VERSION })
      .where(eq(users.id, req.user.sub));
    return { ok: true };
  });
};
