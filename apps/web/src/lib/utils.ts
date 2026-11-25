import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const STAGE_LABEL: Record<string, string> = {
  not_yet_visible: "Not yet visible",
  early_signal: "Early signal",
  emerging: "Emerging",
  growing: "Growing",
  mainstream: "Mainstream",
  saturated: "Saturated",
};

export function fmtScore(n: number | null | undefined): string {
  return n == null ? "–" : String(Math.round(Number(n)));
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const inrRange = (r: { min: number; max: number } | null) =>
  r == null ? "price unknown" : r.min === r.max ? inr(r.min) : `${inr(r.min)}–${inr(r.max)}`;
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const WINDOW_LABEL = {
  start_now: "Start now",
  manufacture_only: "Manufacture only",
  missed: "Missed",
} as const;
export const WINDOW_TONE = { start_now: "ok", manufacture_only: "warn", missed: "danger" } as const;
