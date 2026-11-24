"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { startTour } from "./tour-controller";
import { Button } from "./ui/button";

const item = "cursor-pointer rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted";

export function HelpMenu() {
  return (
    <M.Root>
      <M.Trigger asChild>
        <Button variant="ghost" data-tour="help-menu" aria-label="Help">
          <CircleHelp size={16} /> Help
        </Button>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          className="z-50 min-w-52 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          <M.Item className={item} onSelect={() => startTour("full")}>
            Replay tour
          </M.Item>
          <M.Item className={item} onSelect={() => startTour("changes")}>
            Tour: what changed
          </M.Item>
          <M.Item className={item} asChild>
            <Link href="/whats-new">What changed in this version</Link>
          </M.Item>
          <M.Item className={item} asChild>
            <Link href="/whats-new?compare=1">Compare versions</Link>
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
