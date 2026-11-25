import { generateReport, reports, users, type Db } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import { mailConfigFromEnv, sendReportEmail, type MailConfig, type Transport } from "./email";

/** Generates this week's report for the (single) user and emails it when SMTP is configured. */
export async function runWeeklyReport(
  db: Db,
  opts: { now?: Date; mail?: MailConfig | null; transport?: Transport } = {},
): Promise<{ id: number; emailed: boolean } | null> {
  const [u] = await db.select({ id: users.id }).from(users).orderBy(users.createdAt).limit(1);
  if (!u) return null;
  const { id, report } = await generateReport(db, { userId: u.id, now: opts.now });
  const emailed = await sendReportEmail(
    report,
    opts.mail === undefined ? mailConfigFromEnv() : opts.mail,
    opts.transport,
  );
  if (emailed) await db.update(reports).set({ emailedAt: new Date() }).where(eq(reports.id, id));
  return { id, emailed };
}
