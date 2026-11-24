"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl">
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-sm text-muted-foreground">
              {description}
            </D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          <div className="mt-4">{children}</div>
          <D.Close aria-label="Close" className="absolute right-3 top-3 rounded p-1 hover:bg-muted">
            <X size={16} />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
