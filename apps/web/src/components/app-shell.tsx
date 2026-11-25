"use client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CURRENT_VERSION } from "@trendbridge/shared";
import {
  BarChart3,
  Bell,
  Calculator,
  Database,
  Gauge,
  Gift,
  FileText,
  KanbanSquare,
  Layers,
  LineChart,
  LogOut,
  Scale,
  Star,
  Target,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AlertBell } from "./alert-bell";
import { HelpMenu } from "./help-menu";
import { NewBadge } from "./new-badge";
import { ThemeToggle } from "./theme-toggle";
import { TourController, startTour } from "./tour-controller";
import { Button } from "./ui/button";
import { WhatsNewModal } from "./whats-new-modal";

const NAV: {
  section: string;
  items: { href: string; label: string; icon: typeof Gauge; since?: string }[];
}[] = [
  {
    section: "Discover",
    items: [
      { href: "/", label: "Dashboard", icon: Gauge },
      { href: "/trends", label: "Trend Explorer", icon: LineChart, since: "0.1.0" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, since: "0.7.0" },
      { href: "/verticals", label: "Verticals", icon: Layers, since: "0.6.0" },
      { href: "/gifts", label: "Gifts", icon: Gift, since: "0.4.0" },
    ],
  },
  {
    section: "Decide",
    items: [
      { href: "/economics", label: "Economics", icon: Calculator, since: "0.5.0" },
      { href: "/scoring", label: "Scoring", icon: Scale, since: "0.3.0" },
    ],
  },
  {
    section: "Workflow",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, since: "0.7.0" },
      { href: "/watchlists", label: "Watchlists", icon: Star, since: "0.7.0" },
      { href: "/alerts", label: "Alerts", icon: Bell, since: "0.7.0" },
      { href: "/reports", label: "Reports", icon: FileText, since: "0.7.0" },
      { href: "/predictions", label: "Predictions", icon: Target, since: "0.7.0" },
    ],
  },
  {
    section: "Data",
    items: [
      { href: "/sources", label: "Source Registry", icon: Database, since: "0.1.0" },
      { href: "/import", label: "Import", icon: Upload, since: "0.2.0" },
      { href: "/whats-new", label: "What's New", icon: Sparkles },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  };
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside
        data-tour="sidebar"
        className="border-b border-border bg-card md:w-60 md:border-b-0 md:border-r"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-bold">
            Trend<span className="text-primary">Bridge</span>
          </span>
          <span className="text-xs text-muted-foreground">v{CURRENT_VERSION}</span>
        </div>
        <nav className="flex gap-3 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0 md:pb-4">
          {NAV.map((g) => (
            <div key={g.section} className="flex gap-1 md:mt-3 md:flex-col">
              <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
                {g.section}
              </p>
              {g.items.map(({ href, label, icon: Icon, since }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm hover:bg-muted",
                    (href === "/" ? path === "/" : path.startsWith(href)) && "bg-muted font-medium",
                  )}
                >
                  <Icon size={16} /> {label} {since && <NewBadge since={since} />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-1 border-b border-border px-4 py-2">
          <AlertBell />
          <HelpMenu />
          <ThemeToggle />
          <Button variant="ghost" onClick={logout} aria-label="Sign out">
            <LogOut size={16} />
          </Button>
        </header>
        <main className="flex-1 space-y-4 p-4 md:p-6">{children}</main>
      </div>
      <WhatsNewModal onStartTour={startTour} />
      <TourController />
    </div>
  );
}
