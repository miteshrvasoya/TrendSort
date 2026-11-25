"use client";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";

/** Unseen alert count, refreshed every minute. Clicking opens the Alerts page. */
export function AlertBell() {
  const { data } = useQuery({
    queryKey: ["alerts-unseen"],
    queryFn: () => api<{ count: number }>("/alerts/unseen"),
    refetchInterval: 60_000,
  });
  const n = data?.count ?? 0;
  return (
    <Link
      href="/alerts"
      aria-label={n > 0 ? `${n} unseen alerts` : "Alerts"}
      data-tour="alert-bell"
      className="relative rounded-lg p-2 hover:bg-muted"
    >
      <Bell size={16} />
      {n > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold text-primary-foreground">
          {n > 9 ? "9+" : n}
        </span>
      )}
    </Link>
  );
}
