"use client";
import { CheckField, NumField } from "@/components/num-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WaterfallChart } from "@/components/waterfall-chart";
import { api, type DefaultsResponse, type ScenarioRow } from "@/lib/api";
import {
  assumptionsSchema,
  computeEconomics,
  formatInr,
  sensitivity,
  DUTY_GROUPS,
  type Assumptions,
  type Route,
} from "@trendbridge/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

const ROUTE_LABEL: Record<Route | "skip", string> = {
  import: "Import and resell",
  manufacture: "Indian manufacture / white-label",
  hybrid: "Hybrid (import + local finishing)",
  skip: "Skip",
};
const sel = "rounded-lg border border-border bg-background px-2 py-1 text-sm";

function Calculator() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const trendId = params.get("trend") ? Number(params.get("trend")) : undefined;
  const [group, setGroup] = useState<string>("");
  const [marketplace, setMarketplace] = useState("amazon_in");
  const defaults = useQuery({
    queryKey: ["econ-defaults", trendId, group, marketplace],
    refetchOnWindowFocus: false,
    queryFn: () =>
      api<DefaultsResponse>(
        `/economics/defaults?${new URLSearchParams({ ...(trendId ? { trendId: String(trendId) } : {}), ...(group ? { group } : {}), marketplace }).toString()}`,
      ),
  });
  const scenarios = useQuery({
    queryKey: ["scenarios", trendId],
    queryFn: () =>
      api<ScenarioRow[]>(`/economics/scenarios${trendId ? `?trendId=${trendId}` : ""}`),
  });
  const [a, setA] = useState<Assumptions | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [name, setName] = useState("My scenario");
  const [primary, setPrimary] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadedFrom, setLoadedFrom] = useState<string>("");
  // supplier costs (FOB, BOM, tooling...) start as generic placeholders; results mean nothing until you replace them
  const [touched, setTouched] = useState(false);

  // Apply defaults only when the product / group / marketplace changes. A background refetch must never overwrite what you typed.
  const defaultsKey = `${trendId ?? ""}|${group}|${marketplace}`;
  const appliedKey = useRef("");
  useEffect(() => {
    if (defaults.data && appliedKey.current !== defaultsKey) {
      appliedKey.current = defaultsKey;
      setA(defaults.data.assumptions);
      setLoadedFrom("defaults");
      setTouched(false);
    }
  }, [defaults.data, defaultsKey]);
  const result = useMemo(
    () => (a && assumptionsSchema.safeParse(a).success ? computeEconomics(a) : null),
    [a],
  );
  const sens = useMemo(() => (a && result ? sensitivity(a) : []), [a, result]);
  const valid = a ? assumptionsSchema.safeParse(a) : null;

  if (!a || !defaults.data)
    return <p className="text-sm text-muted-foreground">Loading defaults…</p>;
  const d = defaults.data;
  const top = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => setA({ ...a, [k]: v });
  const imp = (k: keyof Assumptions["import"], v: number | string) => {
    // market-derived fields (FX, duty, IGST) are not supplier quotes; everything else is
    if (k !== "fxInrPerUnit" && k !== "bcdPct" && k !== "igstPct") setTouched(true);
    setA({ ...a, import: { ...a.import, [k]: v } });
  };
  const man = (k: keyof Assumptions["manufacture"], v: number) => {
    setTouched(true);
    setA({ ...a, manufacture: { ...a.manufacture, [k]: v } });
  };
  const hyb = (k: keyof Assumptions["hybrid"], v: number) => {
    setTouched(true);
    setA({ ...a, hybrid: { ...a.hybrid, [k]: v } });
  };
  const rec = result?.recommendation;
  const shown =
    route ?? (rec && rec.route !== "skip" ? rec.route : result?.best?.route) ?? "import";

  const save = async () => {
    setMsg(null);
    try {
      await api("/economics/scenarios", {
        method: "POST",
        json: {
          trendId: trendId ?? null,
          name,
          assumptions: a,
          isPrimary: primary && !!trendId && touched,
          tableVersions: d.tableVersions,
        },
      });
      setMsg(
        trendId && primary && touched
          ? "Saved as the primary scenario for this trend. Re-score to bring margin into its Opportunity score."
          : trendId && primary
            ? "Saved, but NOT as primary: replace the placeholder supplier costs first so a made-up margin cannot feed the score."
            : "Saved.",
      );
      qc.invalidateQueries({ queryKey: ["scenarios"] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const rows: [string, (r: NonNullable<typeof result>["routes"][Route]) => string][] = [
    ["Selling price (incl. GST)", (r) => formatInr(r.sellingPriceInr)],
    ["Unit cost to you", (r) => formatInr(r.unitCost)],
    ["Contribution per unit", (r) => formatInr(r.contribution)],
    ["Margin", (r) => `${r.marginPct.toFixed(1)}%`],
    ["Fixed costs", (r) => formatInr(r.fixedCosts)],
    [
      "Break-even units",
      (r) => (r.breakEvenUnits == null ? "never" : r.breakEvenUnits.toLocaleString("en-IN")),
    ],
    ["MOQ", (r) => r.moqUnits.toLocaleString("en-IN")],
    ["Working capital (first order)", (r) => formatInr(r.workingCapital)],
    [
      "ROI on first order",
      (r) => (r.roiFirstOrderPct == null ? "–" : `${r.roiFirstOrderPct.toFixed(0)}%`),
    ],
    [
      `Planned profit (${a.plannedUnits.toLocaleString("en-IN")} units)`,
      (r) => formatInr(r.plannedProfit),
    ],
    ["Lead time", (r) => `${r.leadTimeDays} days`],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">
          Unit economics{d.trendName ? `: ${d.trendName}` : ""}
        </h1>
        {trendId && (
          <Link className="text-sm underline" href={`/trends/${trendId}`}>
            back to trend
          </Link>
        )}
        <Link className="ml-auto text-sm underline" href="/economics/tables">
          Edit duty &amp; fee tables
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Import-and-resell, Indian manufacture and a hybrid, side by side. Every number is editable;
        defaults come from the versioned duty and fee tables (indicative placeholders until you
        verify them) and the latest ECB rate. This is a planning tool, not tax advice.
      </p>

      <Card className="flex flex-wrap items-center gap-3 text-sm" data-tour="econ-defaults">
        <label>
          Product group{" "}
          <select
            className={sel}
            value={group || d.group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Product group"
          >
            {DUTY_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Marketplace{" "}
          <select
            className={sel}
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            aria-label="Marketplace"
          >
            <option value="amazon_in">Amazon.in</option>
            <option value="flipkart">Flipkart</option>
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setA(d.assumptions);
            setLoadedFrom("defaults");
            setTouched(false);
          }}
        >
          Reset to defaults
        </Button>
        {scenarios.data && scenarios.data.length > 0 && (
          <label>
            Load saved{" "}
            <select
              aria-label="Load saved scenario"
              className={sel}
              value={loadedFrom}
              onChange={(e) => {
                const s = scenarios.data!.find((x) => String(x.id) === e.target.value);
                if (s) {
                  setA(s.assumptions);
                  setLoadedFrom(e.target.value);
                  setTouched(!s.isSample);
                }
              }}
            >
              <option value="defaults">–</option>
              {scenarios.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isPrimary ? " (primary)" : ""}
                  {s.isSample ? " [sample]" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="text-xs text-muted-foreground">
          {d.sources.duty}. {d.sources.fees}. {d.sources.fx}.
        </span>
      </Card>

      {!touched && (
        <p
          role="alert"
          data-testid="placeholder-warning"
          className="rounded-lg border border-warn bg-warn/10 p-3 text-sm text-warn"
        >
          <strong>Supplier costs are placeholders.</strong> FOB price, weight, materials, tooling
          and freight below are generic starting values, so the margins and recommendation are not
          meaningful yet. Replace them with real supplier quotes (the results then lose this
          warning). Until you do, the scenario cannot be saved as a trend&apos;s primary scenario.
        </p>
      )}
      {valid && !valid.success && (
        <p role="alert" className="rounded-lg border border-danger p-2 text-sm text-danger">
          Some inputs are out of range: {valid.error.issues[0]?.path.join(".")}{" "}
          {valid.error.issues[0]?.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3">
          <Card className="space-y-2">
            <h2 className="font-semibold">Selling and fees</h2>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Selling price (incl. GST)"
                unit="₹"
                value={a.sellingPriceInr}
                onChange={(v) => top("sellingPriceInr", v)}
                help={d.sources.price}
              />
              <NumField
                label="GST on sale"
                unit="%"
                value={a.gstOnSalePct}
                onChange={(v) => top("gstOnSalePct", v)}
              />
              <NumField
                label="Referral fee"
                unit="%"
                step={0.5}
                value={a.referralPct}
                onChange={(v) => top("referralPct", v)}
                help={d.sources.fees}
              />
              <NumField
                label="Closing fee"
                unit="₹"
                value={a.closingFeeInr}
                onChange={(v) => top("closingFeeInr", v)}
              />
              <NumField
                label="Fulfilment fee / unit"
                unit="₹"
                value={a.fulfilmentFeeInr}
                onChange={(v) => top("fulfilmentFeeInr", v)}
              />
              <NumField
                label="Ad spend"
                unit="% of revenue"
                value={a.adSpendPct}
                onChange={(v) => top("adSpendPct", v)}
              />
              <NumField
                label="Returns rate"
                unit="%"
                value={a.returnsRatePct}
                onChange={(v) => top("returnsRatePct", v)}
              />
              <NumField
                label="Return shipping"
                unit="₹"
                value={a.returnShippingInr}
                onChange={(v) => top("returnShippingInr", v)}
              />
              <NumField
                label="Returned units written off"
                unit="%"
                value={a.returnWriteOffPct}
                onChange={(v) => top("returnWriteOffPct", v)}
              />
              <NumField
                label="Packaging / unit"
                unit="₹"
                value={a.packagingInr}
                onChange={(v) => top("packagingInr", v)}
              />
            </div>
            <CheckField
              label="GST-registered (IGST and fee GST are claimable, so excluded from cost)"
              checked={a.gstRegistered}
              onChange={(v) => top("gstRegistered", v)}
            />
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">Import and resell</h2>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Supplier price (FOB)"
                value={a.import.fobAmount}
                step={0.1}
                onChange={(v) => imp("fobAmount", v)}
                help={d.sources.supplier}
              />
              <label className="block text-sm">
                <span className="text-muted-foreground">Currency</span>
                <input
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1 uppercase"
                  maxLength={3}
                  value={a.import.fobCurrency}
                  onChange={(e) => imp("fobCurrency", e.target.value.toUpperCase())}
                  aria-label="Currency"
                />
              </label>
              <NumField
                label="FX (₹ per unit)"
                value={a.import.fxInrPerUnit}
                step={0.01}
                onChange={(v) => imp("fxInrPerUnit", v)}
                help={d.sources.fx}
              />
              <NumField
                label="Unit weight"
                unit="kg"
                step={0.05}
                value={a.import.weightKg}
                onChange={(v) => imp("weightKg", v)}
              />
              <NumField
                label="Freight"
                unit="₹/kg"
                value={a.import.freightPerKgInr}
                onChange={(v) => imp("freightPerKgInr", v)}
              />
              <NumField
                label="Insurance"
                unit="% of FOB"
                step={0.125}
                value={a.import.insurancePct}
                onChange={(v) => imp("insurancePct", v)}
              />
              <NumField
                label="Basic customs duty"
                unit="%"
                step={0.5}
                value={a.import.bcdPct}
                onChange={(v) => imp("bcdPct", v)}
                help={d.sources.duty}
              />
              <NumField
                label="Social welfare surcharge"
                unit="% of BCD"
                value={a.import.swsPctOfBcd}
                onChange={(v) => imp("swsPctOfBcd", v)}
              />
              <NumField
                label="IGST"
                unit="%"
                value={a.import.igstPct}
                onChange={(v) => imp("igstPct", v)}
              />
              <NumField
                label="Other duty (AIDC, ADD…)"
                unit="%"
                value={a.import.otherDutyPct}
                onChange={(v) => imp("otherDutyPct", v)}
              />
              <NumField
                label="Clearance per shipment"
                unit="₹"
                value={a.import.clearancePerShipmentInr}
                onChange={(v) => imp("clearancePerShipmentInr", v)}
              />
              <NumField
                label="MOQ / first order"
                unit="units"
                value={a.import.moqUnits}
                onChange={(v) => imp("moqUnits", Math.max(1, Math.round(v)))}
              />
              <NumField
                label="Certification (BIS / WPC…)"
                unit="₹"
                value={a.import.certificationInr}
                onChange={(v) => imp("certificationInr", v)}
              />
              <NumField
                label="Samples"
                unit="₹"
                value={a.import.samplesInr}
                onChange={(v) => imp("samplesInr", v)}
              />
              <NumField
                label="Lead time"
                unit="days"
                value={a.import.leadTimeDays}
                onChange={(v) => imp("leadTimeDays", Math.max(1, Math.round(v)))}
              />
            </div>
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">Indian manufacture / white-label</h2>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Materials (BOM)"
                unit="₹"
                value={a.manufacture.bomInr}
                onChange={(v) => man("bomInr", v)}
              />
              <NumField
                label="Conversion / labour"
                unit="₹"
                value={a.manufacture.conversionInr}
                onChange={(v) => man("conversionInr", v)}
              />
              <NumField
                label="Defect / rework"
                unit="%"
                value={a.manufacture.defectPct}
                onChange={(v) => man("defectPct", v)}
              />
              <NumField
                label="Inbound freight / unit"
                unit="₹"
                value={a.manufacture.inboundFreightInr}
                onChange={(v) => man("inboundFreightInr", v)}
              />
              <NumField
                label="GST on inputs"
                unit="%"
                value={a.manufacture.gstOnInputsPct}
                onChange={(v) => man("gstOnInputsPct", v)}
              />
              <NumField
                label="Tooling / moulds"
                unit="₹"
                value={a.manufacture.toolingInr}
                onChange={(v) => man("toolingInr", v)}
              />
              <NumField
                label="Certification"
                unit="₹"
                value={a.manufacture.certificationInr}
                onChange={(v) => man("certificationInr", v)}
              />
              <NumField
                label="MOQ"
                unit="units"
                value={a.manufacture.moqUnits}
                onChange={(v) => man("moqUnits", Math.max(1, Math.round(v)))}
              />
              <NumField
                label="Lead time"
                unit="days"
                value={a.manufacture.leadTimeDays}
                onChange={(v) => man("leadTimeDays", Math.max(1, Math.round(v)))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Likely hubs depend on the product: see the sourcing hint on the trend page.
            </p>
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">Hybrid: import, then finish locally</h2>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Local finishing / unit"
                unit="₹"
                value={a.hybrid.finishingInr}
                onChange={(v) => hyb("finishingInr", v)}
              />
              <NumField
                label="Finishing setup"
                unit="₹"
                value={a.hybrid.finishingSetupInr}
                onChange={(v) => hyb("finishingSetupInr", v)}
              />
              <NumField
                label="Price premium for finishing"
                unit="%"
                value={a.hybrid.finishPremiumPct}
                onChange={(v) => hyb("finishPremiumPct", v)}
                help="e.g. personalised items sell for more. Leave at 0 if there is no premium."
              />
              <NumField
                label="Extra lead time"
                unit="days"
                value={a.hybrid.finishingLeadDays}
                onChange={(v) => hyb("finishingLeadDays", Math.round(v))}
              />
            </div>
          </Card>
          <Card className="space-y-2" data-tour="econ-limits">
            <h2 className="font-semibold">Plan and limits</h2>
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Units you expect to sell"
                value={a.plannedUnits}
                onChange={(v) => top("plannedUnits", Math.max(1, Math.round(v)))}
              />
              <NumField
                label="Minimum margin"
                unit="%"
                value={a.minMarginPct}
                onChange={(v) => top("minMarginPct", v)}
              />
              <NumField
                label="Cash budget (0 = none)"
                unit="₹"
                value={a.workingCapitalBudgetInr ?? 0}
                onChange={(v) => top("workingCapitalBudgetInr", v > 0 ? v : null)}
              />
              <NumField
                label="Days until you must sell (0 = none)"
                value={a.daysAvailable ?? 0}
                onChange={(v) => top("daysAvailable", v > 0 ? Math.round(v) : null)}
                help="e.g. days to a festival; routes with a longer lead time are ruled out"
              />
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          {result && rec && (
            <Card className="space-y-2 border-primary/40" data-tour="econ-recommendation">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">Recommended route{!touched && " (provisional)"}</h2>
                <Badge tone={rec.route === "skip" ? "danger" : "ok"}>
                  {ROUTE_LABEL[rec.route]}
                </Badge>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {rec.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Card>
          )}
          {result && (
            <Card className="overflow-x-auto p-0" data-tour="econ-compare">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium" />
                    {(["import", "manufacture", "hybrid"] as Route[]).map((r) => (
                      <th key={r} className="px-3 py-2 font-medium">
                        <button
                          className={`underline-offset-2 ${shown === r ? "text-primary underline" : ""}`}
                          onClick={() => setRoute(r)}
                        >
                          {ROUTE_LABEL[r].split(" (")[0]}
                        </button>
                        {rec?.route === r && (
                          <Badge tone="ok" className="ml-1">
                            best
                          </Badge>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, f]) => (
                    <tr key={label} className="border-t border-border">
                      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
                      {(["import", "manufacture", "hybrid"] as Route[]).map((r) => (
                        <td key={r} className="px-3 py-1.5 tabular-nums">
                          {f(result.routes[r])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {result && (
            <Card>
              <h2 className="mb-1 font-semibold">
                Where the money goes: {ROUTE_LABEL[shown].split(" (")[0]} (per unit, ex-GST)
              </h2>
              <WaterfallChart items={result.routes[shown].waterfall} />
            </Card>
          )}
          {sens.length > 0 && (
            <Card>
              <h2 className="mb-1 font-semibold">What if…? (best route)</h2>
              <table className="w-full text-sm">
                <tbody>
                  {sens.map((s) => (
                    <tr key={s.label} className="border-t border-border first:border-0">
                      <td className="py-1">{s.label}</td>
                      <td className="py-1 tabular-nums">{formatInr(s.contribution)} per unit</td>
                      <td className="py-1 text-right tabular-nums">
                        {s.deltaPct > 0 ? "+" : ""}
                        {s.deltaPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Card className="space-y-2" data-tour="econ-save">
            <h2 className="font-semibold">Save this scenario</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                aria-label="Scenario name"
                className={`${sel} w-56`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
              {trendId ? (
                <CheckField
                  label="Use as this trend's primary scenario (feeds its score)"
                  checked={primary}
                  onChange={setPrimary}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Open the calculator from a trend to link and score it.
                </span>
              )}
              <Button onClick={save} disabled={!valid?.success || !name.trim()}>
                Save scenario
              </Button>
            </div>
            {msg && (
              <p role="status" className="text-sm text-ok">
                {msg}
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function EconomicsPage() {
  return (
    <Suspense>
      <Calculator />
    </Suspense>
  );
}
