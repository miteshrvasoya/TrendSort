"use client";
import { api, type VersionRow } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ReleaseNotes } from "./release-notes";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

interface WhatsNew {
  current: string;
  since: string | null;
  isFirstVisit: boolean;
  versions: VersionRow[];
}

/** Appears once after a new version. `onStartTour` lets the user jump straight into the tour. */
export function WhatsNewModal({
  onStartTour,
}: {
  onStartTour: (mode: "full" | "changes") => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["whats-new"],
    queryFn: () => api<WhatsNew>("/versions/whats-new"),
  });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (data && data.versions.length > 0) setOpen(true);
  }, [data]);
  if (!data) return null;

  const close = async (tour?: boolean) => {
    setOpen(false);
    await api("/versions/seen", { method: "POST", json: { version: data.current } });
    qc.invalidateQueries({ queryKey: ["whats-new"] });
    if (tour) onStartTour(data.isFirstVisit ? "full" : "changes");
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) void close();
      }}
      title={data.isFirstVisit ? "Welcome to TrendBridge" : "What's new"}
      description={`You're on v${data.current}`}
    >
      <div className="space-y-6">
        {data.versions.map((v) => (
          <ReleaseNotes key={v.version} v={v} />
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => close()}>
          Got it
        </Button>
        <Button onClick={() => close(true)} data-testid="start-tour">
          {data.isFirstVisit ? "Take the tour" : "Show me what changed"}
        </Button>
      </div>
    </Modal>
  );
}
