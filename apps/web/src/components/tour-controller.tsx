"use client";
import { api } from "@/lib/api";
import type { TourStepDef } from "@trendbridge/shared";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type Mode = "full" | "changes";
export const TOUR_EVENT = "trendbridge:start-tour";
export const startTour = (mode: Mode) =>
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: mode }));

async function waitFor(selector: string, ms = 4000): Promise<Element | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Steps are data from the API. We show one at a time so a tour can span several routes. */
export function TourController() {
  const router = useRouter();
  const active = useRef(false);

  const run = useCallback(
    async (mode: Mode) => {
      if (active.current) return;
      active.current = true;
      try {
        const { steps } = await api<{ steps: TourStepDef[] }>(`/tour?mode=${mode}`);
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i]!;
          if (s.route && window.location.pathname !== s.route) router.push(s.route);
          const el = await waitFor(s.target);
          if (!el) continue; // feature not on screen: skip rather than break
          const dir = await new Promise<"next" | "prev" | "done">((resolve) => {
            const d = driver({
              allowClose: true,
              showProgress: false,
              overlayOpacity: 0.55,
              onDestroyed: () => resolve("done"),
            });
            d.highlight({
              element: el,
              popover: {
                title: `${s.title} (${i + 1}/${steps.length})`,
                description: s.body,
                showButtons: ["next", "previous", "close"],
                nextBtnText: i === steps.length - 1 ? "Finish" : "Next",
                prevBtnText: "Back",
                onNextClick: () => {
                  resolve("next");
                  d.destroy();
                },
                onPrevClick: () => {
                  resolve("prev");
                  d.destroy();
                },
              },
            });
          });
          if (dir === "done") break;
          if (dir === "prev") i = Math.max(-1, i - 2);
        }
        await api("/tour/complete", { method: "POST" });
      } finally {
        active.current = false;
      }
    },
    [router],
  );

  useEffect(() => {
    const h = (e: Event) => void run((e as CustomEvent<Mode>).detail);
    window.addEventListener(TOUR_EVENT, h);
    return () => window.removeEventListener(TOUR_EVENT, h);
  }, [run]);
  return null;
}
