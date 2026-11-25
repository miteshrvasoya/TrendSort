"use client";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

const GEOS = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["AE", "UAE"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["IN", "India"],
];
const VERTS = [
  ["gifts", "Gifts"],
  ["ro", "RO / Water"],
  ["home-kitchen", "Home & Kitchen"],
  ["wellness", "Wellness"],
  ["pet", "Pet"],
  ["beauty", "Beauty"],
];

export function TrackTrendDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [geos, setGeos] = useState<string[]>(["US", "IN"]);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (list: string[], v: string, set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/trends", {
        method: "POST",
        json: {
          name,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          geos,
          verticals,
        },
      });
      await qc.invalidateQueries({ queryKey: ["trends"] });
      setName("");
      setKeywords("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Track a trend"
      description="Google Trends interest, news and marketplace matches are collected for these keywords."
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Trend name
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Personalised star map frame"
            required
            minLength={3}
          />
        </label>
        <label className="block text-sm">
          Keywords (comma separated, up to 10)
          <input
            className={input}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="star map frame, custom night sky print"
            required
          />
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1">Countries to fetch</legend>
          <div className="flex flex-wrap gap-2">
            {GEOS.map(([c, n]) => (
              <label key={c} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={geos.includes(c!)}
                  onChange={() => toggle(geos, c!, setGeos)}
                />
                {n}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Each country is a separate Google Trends call; keep India plus one or two source
            countries to stay inside the free budget.
          </p>
        </fieldset>
        <fieldset className="text-sm">
          <legend className="mb-1">Verticals</legend>
          <div className="flex flex-wrap gap-2">
            {VERTS.map(([v, n]) => (
              <label key={v} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={verticals.includes(v!)}
                  onChange={() => toggle(verticals, v!, setVerticals)}
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || geos.length === 0}>
            {busy ? "Saving…" : "Start tracking"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
