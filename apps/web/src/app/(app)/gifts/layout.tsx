"use client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  ["/gifts", "Browse"],
  ["/gifts/windows", "Gifting windows"],
  ["/gifts/bundles", "Bundles"],
  ["/gifts/corporate", "Corporate"],
];

export default function GiftsLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Gifts</h1>
      </div>
      <nav data-tour="gift-tabs" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([href, label]) => (
          <Link
            key={href}
            href={href!}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              path === href
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="space-y-4 pt-2">{children}</div>
    </>
  );
}
