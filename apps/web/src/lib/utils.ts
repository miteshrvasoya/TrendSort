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
