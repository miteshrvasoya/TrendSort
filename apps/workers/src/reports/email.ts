import { reportToHtml, reportToMarkdown, type Report } from "@trendbridge/shared";
import nodemailer from "nodemailer";

export interface MailConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}
export interface Transport {
  sendMail(m: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

/** Free option: your own SMTP (e.g. a Gmail app password). Returns null when not configured: the report is then download-only. */
export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  if (!env.SMTP_HOST || !env.REPORT_EMAIL_TO) return null;
  return {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM ?? env.SMTP_USER ?? "trendbridge@localhost",
    to: env.REPORT_EMAIL_TO,
  };
}

export async function sendReportEmail(
  report: Report,
  cfg: MailConfig | null,
  transport?: Transport,
): Promise<boolean> {
  if (!cfg) return false;
  const t =
    transport ??
    nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  await t.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: `TrendBridge weekly report: week of ${report.weekOf}${report.mode === "sample" ? " (SAMPLE DATA)" : ""}`,
    text: reportToMarkdown(report),
    html: reportToHtml(report),
  });
  return true;
}
