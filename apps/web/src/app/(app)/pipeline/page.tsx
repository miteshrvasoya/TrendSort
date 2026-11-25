"use client";
import { NumField } from "@/components/num-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { api, downloadFile, type PipelineItem, type Quote } from "@/lib/api";
import { STAGE_LABEL, fmtScore } from "@/lib/utils";
import { PIPELINE_LABEL, PIPELINE_STAGES, type PipelineStage } from "@trendbridge/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

const input = "w-full rounded-lg border border-border bg-background px-2 py-1 text-sm";

export default function PipelinePage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pipeline"],
    queryFn: () => api<PipelineItem[]>("/pipeline"),
  });
  const [open, setOpen] = useState<PipelineItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const inval = () => qc.invalidateQueries({ queryKey: ["pipeline"] });
  const move = useMutation({
    mutationFn: (v: { id: number; stage: PipelineStage }) =>
      api(`/pipeline/${v.id}`, { method: "PUT", json: { stage: v.stage } }),
    onSuccess: inval,
  });
  const add = useMutation({
    mutationFn: () => api("/pipeline", { method: "POST", json: { title } }),
    onSuccess: () => {
      setTitle("");
      setAdding(false);
      inval();
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const by = (s: string) => (data ?? []).filter((i) => i.stage === s);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Idea pipeline</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadFile("/export/pipeline.csv", "pipeline.csv").catch((e) =>
                setMsg((e as Error).message),
              )
            }
          >
            Export CSV
          </Button>
          <Button data-tour="pipeline-add" onClick={() => setAdding(true)}>
            Add idea
          </Button>
        </div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Drag a card to move it, or use the stage menu. Add trends from their page with “Add to
        pipeline”. Ideas untouched for 21 days are flagged as stuck.
      </p>
      {msg && (
        <p role="alert" className="text-sm text-danger">
          {msg}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2" data-tour="pipeline-board">
        {PIPELINE_STAGES.map((s) => (
          <div
            key={s}
            className="w-64 shrink-0 space-y-2 rounded-lg bg-muted/50 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = Number(e.dataTransfer.getData("text/plain"));
              if (id) move.mutate({ id, stage: s });
            }}
            data-testid={`col-${s}`}
          >
            <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
              {PIPELINE_LABEL[s]}
              <Badge>{by(s).length}</Badge>
            </h2>
            {by(s).map((i) => (
              <Card
                key={i.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i.id))}
                className="cursor-grab space-y-1 p-3"
                data-testid="pipeline-card"
              >
                <button
                  className="text-left text-sm font-medium hover:underline"
                  onClick={() => setOpen(i)}
                >
                  {i.title}
                </button>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {i.stuck && <Badge tone="warn">stuck</Badge>}
                  {i.trend?.isSample && <Badge tone="sample">Sample</Badge>}
                  {i.trend?.stage && <Badge>{STAGE_LABEL[i.trend.stage]}</Badge>}
                  {i.trend?.opportunity != null && <span>Opp {fmtScore(i.trend.opportunity)}</span>}
                  {i.quotes.length > 0 && (
                    <span>
                      {i.quotes.length} quote{i.quotes.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <select
                  aria-label={`Stage of ${i.title}`}
                  className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                  value={i.stage}
                  onChange={(e) =>
                    move.mutate({ id: i.id, stage: e.target.value as PipelineStage })
                  }
                >
                  {PIPELINE_STAGES.map((x) => (
                    <option key={x} value={x}>
                      {PIPELINE_LABEL[x]}
                    </option>
                  ))}
                </select>
              </Card>
            ))}
          </div>
        ))}
      </div>

      <Modal
        open={adding}
        onOpenChange={setAdding}
        title="Add an idea"
        description="A product idea you want to track from spotted to scaling."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="space-y-3"
        >
          <input
            aria-label="Idea title"
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Engraved bamboo desk organiser"
            required
            minLength={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              Add
            </Button>
          </div>
        </form>
      </Modal>
      {open && <ItemDialog item={open} onClose={() => setOpen(null)} onSaved={inval} />}
    </>
  );
}

function ItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item: PipelineItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [results, setResults] = useState(item.results ?? "");
  const [quotes, setQuotes] = useState<Quote[]>(item.quotes);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setTitle(item.title);
    setNotes(item.notes ?? "");
    setResults(item.results ?? "");
    setQuotes(item.quotes);
  }, [item]);
  const save = useMutation({
    mutationFn: () =>
      api(`/pipeline/${item.id}`, {
        method: "PUT",
        json: { title: item.trendId == null ? title : undefined, notes, results, quotes },
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => api(`/pipeline/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const setQ = (i: number, patch: Partial<Quote>) =>
    setQuotes(quotes.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.title}
      description={`Stage: ${PIPELINE_LABEL[item.stage as PipelineStage]}`}
    >
      <div className="space-y-3 text-sm">
        {item.trendId != null ? (
          <Link className="underline" href={`/trends/${item.trendId}`}>
            Open the trend
          </Link>
        ) : (
          <label className="block">
            Title
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        <label className="block">
          Notes
          <textarea
            aria-label="Notes"
            rows={3}
            className={input}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="font-medium">Supplier quotes</legend>
          {quotes.map((q, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2">
              <label>
                Supplier
                <input
                  className={input}
                  value={q.supplier}
                  onChange={(e) => setQ(i, { supplier: e.target.value })}
                />
              </label>
              <NumField
                label="Price"
                value={q.price ?? 0}
                step={0.01}
                onChange={(v) => setQ(i, { price: v })}
              />
              <NumField
                label="MOQ"
                value={q.moq ?? 0}
                onChange={(v) => setQ(i, { moq: Math.round(v) })}
              />
              <label>
                Currency
                <input
                  className={input}
                  maxLength={3}
                  value={q.currency}
                  onChange={(e) => setQ(i, { currency: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="col-span-2">
                Note
                <input
                  className={input}
                  value={q.note}
                  onChange={(e) => setQ(i, { note: e.target.value })}
                />
              </label>
              <Button
                variant="ghost"
                className="col-span-2 justify-self-end text-xs"
                onClick={() => setQuotes(quotes.filter((_, j) => j !== i))}
              >
                Remove quote
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setQuotes([
                ...quotes,
                {
                  supplier: "",
                  price: null,
                  currency: "USD",
                  moq: null,
                  note: "",
                  date: new Date().toISOString().slice(0, 10),
                },
              ])
            }
          >
            Add quote
          </Button>
        </fieldset>
        <label className="block">
          Results
          <textarea
            aria-label="Results"
            rows={3}
            className={input}
            value={results}
            onChange={(e) => setResults(e.target.value)}
            placeholder="What happened: sample quality, first sales, ad results…"
          />
        </label>
        {msg && (
          <p role="alert" className="text-danger">
            {msg}
          </p>
        )}
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => confirm("Delete this idea?") && del.mutate()}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
