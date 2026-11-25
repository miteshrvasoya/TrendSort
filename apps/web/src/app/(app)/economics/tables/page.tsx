"use client";
import { NumField } from "@/components/num-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type TablesResponse } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function TablesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["econ-tables"],
    queryFn: () => api<TablesResponse>("/economics/tables"),
  });
  const [duty, setDuty] = useState<Record<string, { bcd: number; igst: number }>>({});
  const [fee, setFee] = useState<Record<string, { ref: number; close: number }>>({});
  const [hist, setHist] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const done = (m: string) => {
    setMsg(m);
    qc.invalidateQueries({ queryKey: ["econ-tables"] });
    qc.invalidateQueries({ queryKey: ["econ-defaults"] });
  };
  const saveDuty = useMutation({
    mutationFn: (g: string) =>
      api("/economics/tables/duty", {
        method: "PUT",
        json: { groupKey: g, bcdPct: duty[g]!.bcd, igstPct: duty[g]!.igst, otherPct: 0 },
      }),
    onSuccess: (_r, g) => done(`Saved a new version for ${g}.`),
    onError: (e) => setMsg((e as Error).message),
  });
  const saveFee = useMutation({
    mutationFn: (k: string) => {
      const [m, c] = k.split("|");
      return api("/economics/tables/fees", {
        method: "PUT",
        json: {
          marketplace: m,
          category: c,
          referralPct: fee[k]!.ref,
          closingFeeInr: fee[k]!.close,
        },
      });
    },
    onSuccess: (_r, k) => done(`Saved a new version for ${k.replace("|", " / ")}.`),
    onError: (e) => setMsg((e as Error).message),
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Duty and fee tables</h1>
        <Link href="/economics" className="ml-auto text-sm underline">
          back to calculator
        </Link>
      </div>
      <p className="max-w-3xl rounded-lg border border-dashed border-warn bg-warn/10 p-2 text-sm text-warn">
        Rows marked INDICATIVE are placeholders from general knowledge, not official figures. Verify
        duty on the CBIC / ICEGATE tariff (with your CHA) and fees in your seller portal, then edit
        them here. Each edit creates a new version; old versions are kept and scenarios record which
        version they used.
      </p>
      {msg && (
        <p role="status" className="rounded-lg bg-muted p-2 text-sm">
          {msg}
        </p>
      )}
      <Card className="overflow-x-auto p-0" data-tour="duty-table">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {["Group", "HS (example)", "Basic duty %", "IGST %", "Version", "Status", ""].map(
                (h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {data?.duty.map((r) => {
              const e = duty[r.groupKey] ?? { bcd: r.basicDutyPct, igst: r.igstPct };
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">{r.groupKey}</td>
                  <td className="px-3 py-2">{r.hsCode}</td>
                  <td className="px-3 py-2">
                    <NumField
                      label={`${r.groupKey} basic duty`}
                      value={e.bcd}
                      step={0.5}
                      onChange={(v) => setDuty({ ...duty, [r.groupKey]: { ...e, bcd: v } })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NumField
                      label={`${r.groupKey} IGST`}
                      value={e.igst}
                      onChange={(v) => setDuty({ ...duty, [r.groupKey]: { ...e, igst: v } })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="underline"
                      onClick={() => setHist(hist === `d${r.groupKey}` ? null : `d${r.groupKey}`)}
                    >
                      v{r.version}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {r.isIndicative ? (
                      <Badge tone="warn">INDICATIVE</Badge>
                    ) : (
                      <Badge tone="ok">edited by you</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="outline"
                      className="px-2 py-1 text-xs"
                      onClick={() => saveDuty.mutate(r.groupKey)}
                      disabled={!duty[r.groupKey]}
                    >
                      Save new version
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {hist?.startsWith("d") && (
        <Card>
          <h2 className="mb-1 font-semibold">History: {hist.slice(1)}</h2>
          <ul className="text-sm">
            {data?.dutyHistory
              .filter((h) => h.groupKey === hist.slice(1))
              .map((h) => (
                <li key={h.id}>
                  v{h.version} · {h.effectiveFrom} · BCD {h.basicDutyPct}% · IGST {h.igstPct}% ·{" "}
                  {h.isIndicative ? "indicative" : "edited"}
                  {h.note ? ` · ${h.note}` : ""}
                </li>
              ))}
          </ul>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "Marketplace",
                "Category group",
                "Referral %",
                "Closing fee ₹",
                "Version",
                "Status",
                "",
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.fees.map((r) => {
              const k = `${r.marketplace}|${r.category}`;
              const e = fee[k] ?? { ref: r.referralPct, close: r.closingFeeInr };
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">{r.marketplace}</td>
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2">
                    <NumField
                      label={`${k} referral`}
                      value={e.ref}
                      step={0.5}
                      onChange={(v) => setFee({ ...fee, [k]: { ...e, ref: v } })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NumField
                      label={`${k} closing fee`}
                      value={e.close}
                      onChange={(v) => setFee({ ...fee, [k]: { ...e, close: v } })}
                    />
                  </td>
                  <td className="px-3 py-2">v{r.version}</td>
                  <td className="px-3 py-2">
                    {r.isIndicative ? (
                      <Badge tone="warn">INDICATIVE</Badge>
                    ) : (
                      <Badge tone="ok">edited by you</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="outline"
                      className="px-2 py-1 text-xs"
                      onClick={() => saveFee.mutate(k)}
                      disabled={!fee[k]}
                    >
                      Save new version
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
