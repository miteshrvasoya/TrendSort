"use client";
import { api, type GiftFacets } from "@/lib/api";
import { DEFAULT_PRICE_BREAKS } from "@trendbridge/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

interface Profile {
  recipients: string[];
  ageGroups: string[];
  interests: string[];
  personalisation: string;
  priceMinInr: number | null;
  priceMaxInr: number | null;
  corporate: {
    moq: number;
    branding: string[];
    leadTimeDays: number;
    priceBreaks: { qty: number; discountPct: number }[];
  } | null;
}
const BRANDING = [
  "logo print",
  "laser engraving",
  "embroidery",
  "custom box / sleeve",
  "personalised card",
];
const label = (s: string) => s.replace(/-/g, " ");

export function GiftProfileDialog({
  trendId,
  open,
  onOpenChange,
}: {
  trendId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const facets = useQuery({
    queryKey: ["gift-facets"],
    queryFn: () => api<GiftFacets>("/gifts/facets"),
  });
  const cur = useQuery({
    queryKey: ["gift-profile", trendId],
    queryFn: () =>
      api<{ exists: boolean; occasions: string[]; profile: Profile | null }>(
        `/trends/${trendId}/gift-profile`,
      ),
    enabled: open,
  });
  const [p, setP] = useState<Profile>({
    recipients: [],
    ageGroups: ["adults"],
    interests: [],
    personalisation: "none",
    priceMinInr: null,
    priceMaxInr: null,
    corporate: null,
  });
  const [occ, setOcc] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (cur.data) {
      if (cur.data.profile) setP(cur.data.profile);
      setOcc(cur.data.occasions);
    }
  }, [cur.data]);
  const tog = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const Group = ({
    title,
    options,
    value,
    onChange,
  }: {
    title: string;
    options: readonly string[];
    value: string[];
    onChange: (v: string[]) => void;
  }) => (
    <fieldset className="text-sm">
      <legend className="mb-1 font-medium">{title}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={value.includes(o)}
              onChange={() => onChange(tog(value, o))}
            />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
  const input = "rounded-lg border border-border bg-background px-2 py-1 text-sm";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/trends/${trendId}/gift-profile`, {
        method: "PUT",
        json: { ...p, occasions: occ },
      });
      await qc.invalidateQueries();
      onOpenChange(false);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Gift details"
      description="Tell TrendBridge who this gift suits so it shows up in the Gifts filters and windows."
    >
      <form onSubmit={submit} className="space-y-3">
        <Group
          title="Occasions"
          options={facets.data?.occasions.map((o) => o.key) ?? []}
          value={occ}
          onChange={setOcc}
        />
        <Group
          title="Recipients"
          options={facets.data?.recipients ?? []}
          value={p.recipients}
          onChange={(v) => setP({ ...p, recipients: v })}
        />
        <Group
          title="Age groups"
          options={facets.data?.ages ?? []}
          value={p.ageGroups}
          onChange={(v) => setP({ ...p, ageGroups: v })}
        />
        <Group
          title="Interests"
          options={facets.data?.interests ?? []}
          value={p.interests}
          onChange={(v) => setP({ ...p, interests: v })}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            Personalisation{" "}
            <select
              className={input}
              value={p.personalisation}
              onChange={(e) => setP({ ...p, personalisation: e.target.value })}
            >
              {facets.data?.personalisation.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Typical price ₹{" "}
            <input
              aria-label="Min price"
              type="number"
              min={0}
              className={`${input} w-24`}
              value={p.priceMinInr ?? ""}
              onChange={(e) =>
                setP({ ...p, priceMinInr: e.target.value === "" ? null : Number(e.target.value) })
              }
            />{" "}
            to{" "}
            <input
              aria-label="Max price"
              type="number"
              min={0}
              className={`${input} w-24`}
              value={p.priceMaxInr ?? ""}
              onChange={(e) =>
                setP({ ...p, priceMaxInr: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.corporate != null}
            onChange={(e) =>
              setP({
                ...p,
                corporate: e.target.checked
                  ? {
                      moq: 25,
                      branding: ["logo print"],
                      leadTimeDays: 21,
                      priceBreaks: DEFAULT_PRICE_BREAKS,
                    }
                  : null,
              })
            }
          />{" "}
          Suitable for corporate / bulk orders
        </label>
        {p.corporate && (
          <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            <label>
              MOQ{" "}
              <input
                type="number"
                min={1}
                className={`${input} w-20`}
                value={p.corporate.moq}
                onChange={(e) =>
                  setP({ ...p, corporate: { ...p.corporate!, moq: Number(e.target.value) || 1 } })
                }
              />
            </label>{" "}
            <label>
              Lead time (days){" "}
              <input
                type="number"
                min={1}
                className={`${input} w-20`}
                value={p.corporate.leadTimeDays}
                onChange={(e) =>
                  setP({
                    ...p,
                    corporate: { ...p.corporate!, leadTimeDays: Number(e.target.value) || 1 },
                  })
                }
              />
            </label>
            <Group
              title="Branding options"
              options={BRANDING}
              value={p.corporate.branding}
              onChange={(v) => setP({ ...p, corporate: { ...p.corporate!, branding: v } })}
            />
            <p className="text-xs text-muted-foreground">
              Price breaks start from the defaults (
              {DEFAULT_PRICE_BREAKS.map((b) => `${b.qty}+: ${b.discountPct}%`).join(", ")}); replace
              them with real supplier quotes later.
            </p>
          </div>
        )}
        {err && (
          <p role="alert" className="text-sm text-danger">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Save gift details</Button>
        </div>
      </form>
    </Modal>
  );
}
