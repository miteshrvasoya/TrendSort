import { z } from "zod";
import { IMPORT_LEAD_DAYS, MANUFACTURE_LEAD_DAYS_DEFAULT } from "./constants";

// ------------------------------------------------------------------ assumptions
const pct = z.number().min(0).max(1000);
const money = z.number().min(0).max(1e9);

export const importAssumptionsSchema = z.object({
  fobAmount: money,
  fobCurrency: z.string().length(3),
  fxInrPerUnit: z.number().positive().max(1e6),
  weightKg: z.number().min(0).max(1e4),
  freightPerKgInr: money,
  insurancePct: pct,
  landingChargesPct: pct, // customs valuation add-ons (notional, not cash)
  bcdPct: pct,
  swsPctOfBcd: pct,
  igstPct: pct,
  otherDutyPct: pct,
  clearancePerShipmentInr: money,
  moqUnits: z.number().int().min(1).max(1e7),
  certificationInr: money,
  samplesInr: money,
  leadTimeDays: z.number().int().min(1).max(730),
});
export const manufactureAssumptionsSchema = z.object({
  bomInr: money,
  conversionInr: money,
  defectPct: pct,
  inboundFreightInr: money,
  gstOnInputsPct: pct,
  toolingInr: money,
  certificationInr: money,
  moqUnits: z.number().int().min(1).max(1e7),
  leadTimeDays: z.number().int().min(1).max(730),
});
export const hybridAssumptionsSchema = z.object({
  finishingInr: money,
  finishingSetupInr: money,
  finishPremiumPct: pct,
  finishingLeadDays: z.number().int().min(0).max(365),
});
export const assumptionsSchema = z.object({
  sellingPriceInr: z.number().positive().max(1e7),
  gstOnSalePct: pct,
  gstRegistered: z.boolean(),
  marketplace: z.string().min(2),
  feeCategory: z.string().min(1),
  referralPct: pct,
  closingFeeInr: money,
  fulfilmentFeeInr: money,
  feesGstPct: pct,
  referralOnGross: z.boolean(),
  returnsRatePct: pct,
  returnShippingInr: money,
  returnWriteOffPct: pct,
  adSpendPct: pct,
  packagingInr: money,
  otherPerUnitInr: money,
  plannedUnits: z.number().int().min(1).max(1e8),
  minMarginPct: pct,
  workingCapitalBudgetInr: money.nullable(),
  daysAvailable: z.number().int().min(0).max(3650).nullable(),
  import: importAssumptionsSchema,
  manufacture: manufactureAssumptionsSchema,
  hybrid: hybridAssumptionsSchema,
});
export type Assumptions = z.infer<typeof assumptionsSchema>;
export type ImportAssumptions = z.infer<typeof importAssumptionsSchema>;

/** Neutral starting point. Real defaults come from the editable duty / fee tables and the latest FX rate. */
export function baseAssumptions(): Assumptions {
  return {
    sellingPriceInr: 999,
    gstOnSalePct: 18,
    gstRegistered: true,
    marketplace: "amazon_in",
    feeCategory: "general",
    referralPct: 12,
    closingFeeInr: 25,
    fulfilmentFeeInr: 60,
    feesGstPct: 18,
    referralOnGross: true,
    returnsRatePct: 8,
    returnShippingInr: 80,
    returnWriteOffPct: 50,
    adSpendPct: 10,
    packagingInr: 25,
    otherPerUnitInr: 0,
    plannedUnits: 1000,
    minMarginPct: 15,
    workingCapitalBudgetInr: null,
    daysAvailable: null,
    import: {
      fobAmount: 3,
      fobCurrency: "USD",
      fxInrPerUnit: 85,
      weightKg: 0.4,
      freightPerKgInr: 350,
      insurancePct: 1.125,
      landingChargesPct: 1,
      bcdPct: 20,
      swsPctOfBcd: 10,
      igstPct: 18,
      otherDutyPct: 0,
      clearancePerShipmentInr: 12000,
      moqUnits: 500,
      certificationInr: 0,
      samplesInr: 8000,
      leadTimeDays: IMPORT_LEAD_DAYS,
    },
    manufacture: {
      bomInr: 120,
      conversionInr: 60,
      defectPct: 4,
      inboundFreightInr: 8,
      gstOnInputsPct: 18,
      toolingInr: 60000,
      certificationInr: 0,
      moqUnits: 500,
      leadTimeDays: MANUFACTURE_LEAD_DAYS_DEFAULT,
    },
    hybrid: {
      finishingInr: 45,
      finishingSetupInr: 15000,
      finishPremiumPct: 0,
      finishingLeadDays: 7,
    },
  };
}

// ------------------------------------------------------------------ results
export type Route = "import" | "manufacture" | "hybrid";
export interface WaterfallItem {
  label: string;
  value: number;
  kind: "revenue" | "cost" | "result";
}
export interface RouteResult {
  route: Route;
  sellingPriceInr: number;
  revenueExGst: number;
  unitCost: number; // what one unit costs you to land / make (tax treatment per gstRegistered)
  costBreakdown: Record<string, number>;
  fees: number;
  ads: number;
  returnsCost: number;
  packaging: number;
  other: number;
  contribution: number;
  marginPct: number;
  fixedCosts: number;
  breakEvenUnits: number | null;
  moqUnits: number;
  workingCapital: number;
  roiFirstOrderPct: number | null;
  plannedProfit: number;
  leadTimeDays: number;
  waterfall: WaterfallItem[];
}
export interface Recommendation {
  route: Route | "skip";
  reasons: string[];
  blocked: { route: Route; reason: string }[];
}
export interface EconomicsResult {
  routes: Record<Route, RouteResult>;
  recommendation: Recommendation;
  best: RouteResult | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
export const formatInr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

// ------------------------------------------------------------------ import cost (customs maths)
export interface LandedCost {
  fobInr: number;
  freight: number;
  insurance: number;
  cif: number;
  assessableValue: number;
  bcd: number;
  sws: number;
  otherDuty: number;
  igst: number;
  clearancePerUnit: number;
  landedExIgst: number;
  landedInclIgst: number;
}

/**
 * Indian customs valuation: AV = (CIF) x (1 + landing charges %); BCD = AV x BCD%; SWS = BCD x SWS%;
 * IGST = (AV + BCD + SWS + other) x IGST%. Landing charges only inflate the duty base; they are not cash costs.
 * All rates are inputs (editable tables); defaults are indicative and must be verified with your CHA.
 */
export function landedCost(i: ImportAssumptions): LandedCost {
  const fobInr = i.fobAmount * i.fxInrPerUnit;
  const freight = i.weightKg * i.freightPerKgInr;
  const insurance = (i.insurancePct / 100) * fobInr;
  const cif = fobInr + freight + insurance;
  const assessableValue = cif * (1 + i.landingChargesPct / 100);
  const bcd = assessableValue * (i.bcdPct / 100);
  const sws = bcd * (i.swsPctOfBcd / 100);
  const otherDuty = assessableValue * (i.otherDutyPct / 100);
  const igst = (assessableValue + bcd + sws + otherDuty) * (i.igstPct / 100);
  const clearancePerUnit = i.clearancePerShipmentInr / i.moqUnits;
  const landedExIgst = cif + bcd + sws + otherDuty + clearancePerUnit;
  return {
    fobInr,
    freight,
    insurance,
    cif,
    assessableValue,
    bcd,
    sws,
    otherDuty,
    igst,
    clearancePerUnit,
    landedExIgst,
    landedInclIgst: landedExIgst + igst,
  };
}

// ------------------------------------------------------------------ per route
interface Core {
  price: number;
  unitCost: number;
  costBreakdown: Record<string, number>;
  fixed: number;
  moq: number;
  wc: number;
  lead: number;
  route: Route;
}

function finish(a: Assumptions, c: Core): RouteResult {
  const rev = c.price / (1 + a.gstOnSalePct / 100);
  const referral = (a.referralPct / 100) * (a.referralOnGross ? c.price : rev);
  const feeBase = referral + a.closingFeeInr + a.fulfilmentFeeInr;
  const fees = feeBase * (a.gstRegistered ? 1 : 1 + a.feesGstPct / 100); // marketplace fees carry GST; claimable if registered
  const ads = (a.adSpendPct / 100) * rev;
  const returnsCost =
    (a.returnsRatePct / 100) * (a.returnShippingInr + (a.returnWriteOffPct / 100) * c.unitCost);
  const contribution =
    rev - c.unitCost - a.packagingInr - a.otherPerUnitInr - fees - ads - returnsCost;
  const marginPct = rev > 0 ? (contribution / rev) * 100 : 0;
  const breakEven = contribution > 0 ? Math.ceil(c.fixed / contribution) : null;
  const firstOrderProfit = contribution * c.moq - c.fixed;
  const wc = c.wc + a.packagingInr * c.moq;
  const items: WaterfallItem[] = [
    { label: "Selling price (ex-GST)", value: r2(rev), kind: "revenue" },
    ...Object.entries(c.costBreakdown)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value: r2(value), kind: "cost" as const })),
    { label: "Packaging & other", value: r2(a.packagingInr + a.otherPerUnitInr), kind: "cost" },
    { label: "Marketplace fees", value: r2(fees), kind: "cost" },
    { label: "Advertising", value: r2(ads), kind: "cost" },
    { label: "Returns", value: r2(returnsCost), kind: "cost" },
    { label: "Contribution", value: r2(contribution), kind: "result" },
  ];
  const waterfall = items.filter((w) => w.value !== 0 || w.kind !== "cost");
  return {
    route: c.route,
    sellingPriceInr: r2(c.price),
    revenueExGst: r2(rev),
    unitCost: r2(c.unitCost),
    costBreakdown: Object.fromEntries(Object.entries(c.costBreakdown).map(([k, v]) => [k, r2(v)])),
    fees: r2(fees),
    ads: r2(ads),
    returnsCost: r2(returnsCost),
    packaging: r2(a.packagingInr),
    other: r2(a.otherPerUnitInr),
    contribution: r2(contribution),
    marginPct: r2(marginPct),
    fixedCosts: r2(c.fixed),
    breakEvenUnits: breakEven,
    moqUnits: c.moq,
    workingCapital: r2(wc),
    roiFirstOrderPct: wc > 0 ? r2((firstOrderProfit / wc) * 100) : null,
    plannedProfit: r2(contribution * a.plannedUnits - c.fixed),
    leadTimeDays: c.lead,
    waterfall,
  };
}

function importCore(a: Assumptions): Core & { landed: LandedCost } {
  const l = landedCost(a.import);
  const duty = l.bcd + l.sws + l.otherDuty;
  const unitCost = a.gstRegistered ? l.landedExIgst : l.landedInclIgst;
  const costBreakdown: Record<string, number> = {
    "Product (FOB)": l.fobInr,
    "Freight & insurance": l.freight + l.insurance,
    "Customs duty": duty,
    "Clearance (per unit)": l.clearancePerUnit,
  };
  if (!a.gstRegistered) costBreakdown["IGST (not claimable)"] = l.igst;
  // IGST is paid at the border even when claimable later, so it ties up cash
  const wc = (a.gstRegistered ? l.landedExIgst + l.igst : l.landedInclIgst) * a.import.moqUnits;
  return {
    route: "import",
    price: a.sellingPriceInr,
    unitCost,
    costBreakdown,
    fixed: a.import.certificationInr + a.import.samplesInr,
    moq: a.import.moqUnits,
    wc,
    lead: a.import.leadTimeDays,
    landed: l,
  };
}

function manufactureCore(a: Assumptions): Core {
  const m = a.manufacture;
  const made = (m.bomInr + m.conversionInr) * (1 + m.defectPct / 100);
  const gst = a.gstRegistered ? 0 : (m.gstOnInputsPct / 100) * m.bomInr;
  const unitCost = made + m.inboundFreightInr + gst;
  const costBreakdown: Record<string, number> = {
    "Materials (BOM)": m.bomInr * (1 + m.defectPct / 100),
    "Conversion / labour": m.conversionInr * (1 + m.defectPct / 100),
    "Inbound freight": m.inboundFreightInr,
  };
  if (!a.gstRegistered) costBreakdown["Input GST (not claimable)"] = gst;
  const wcGst = a.gstRegistered ? (m.gstOnInputsPct / 100) * m.bomInr : 0; // paid up front, claimed later
  return {
    route: "manufacture",
    price: a.sellingPriceInr,
    unitCost,
    costBreakdown,
    fixed: m.toolingInr + m.certificationInr,
    moq: m.moqUnits,
    wc: (unitCost + wcGst) * m.moqUnits,
    lead: m.leadTimeDays,
  };
}

function hybridCore(a: Assumptions): Core {
  const i = importCore(a);
  const h = a.hybrid;
  return {
    route: "hybrid",
    price: a.sellingPriceInr * (1 + h.finishPremiumPct / 100),
    unitCost: i.unitCost + h.finishingInr,
    costBreakdown: { ...i.costBreakdown, "Local finishing / personalisation": h.finishingInr },
    fixed: i.fixed + h.finishingSetupInr,
    moq: i.moq,
    wc: i.wc + h.finishingInr * i.moq,
    lead: i.lead + h.finishingLeadDays,
  };
}

// ------------------------------------------------------------------ recommendation
function recommend(a: Assumptions, routes: Record<Route, RouteResult>): Recommendation {
  const blocked: Recommendation["blocked"] = [];
  const viable: RouteResult[] = [];
  for (const r of Object.values(routes)) {
    if (r.contribution <= 0)
      blocked.push({ route: r.route, reason: `loses ${formatInr(-r.contribution)} per unit` });
    else if (r.marginPct < a.minMarginPct)
      blocked.push({
        route: r.route,
        reason: `margin ${r.marginPct.toFixed(1)}% is below your ${a.minMarginPct}% minimum`,
      });
    else if (a.daysAvailable != null && r.leadTimeDays > a.daysAvailable)
      blocked.push({
        route: r.route,
        reason: `lead time ${r.leadTimeDays} days exceeds the ${a.daysAvailable} days available`,
      });
    else if (a.workingCapitalBudgetInr != null && r.workingCapital > a.workingCapitalBudgetInr)
      blocked.push({
        route: r.route,
        reason: `needs ${formatInr(r.workingCapital)} working capital, above your ${formatInr(a.workingCapitalBudgetInr)} budget`,
      });
    else viable.push(r);
  }
  if (viable.length === 0) {
    return {
      route: "skip",
      blocked,
      reasons: [
        "No route clears your margin, timing and cash limits.",
        ...blocked.map((b) => `${b.route}: ${b.reason}`),
      ],
    };
  }
  viable.sort((x, y) => y.plannedProfit - x.plannedProfit);
  const best = viable[0]!;
  const reasons = [
    `${best.route} gives the highest planned profit over ${a.plannedUnits.toLocaleString("en-IN")} units: ${formatInr(best.plannedProfit)} (${best.marginPct.toFixed(1)}% margin, ${formatInr(best.contribution)} per unit).`,
    best.breakEvenUnits != null
      ? `Break-even after ${best.breakEvenUnits.toLocaleString("en-IN")} units to recover ${formatInr(best.fixedCosts)} of fixed costs; first order needs ${formatInr(best.workingCapital)} of working capital for ${best.moqUnits} units.`
      : "No fixed costs to recover.",
    `Lead time about ${best.leadTimeDays} days.`,
  ];
  const second = viable[1];
  if (second)
    reasons.push(
      `Next best: ${second.route} at ${formatInr(second.plannedProfit)} planned profit.`,
    );
  for (const b of blocked) reasons.push(`Ruled out ${b.route}: ${b.reason}.`);
  return { route: best.route, reasons, blocked };
}

export function computeEconomics(a: Assumptions): EconomicsResult {
  const routes: Record<Route, RouteResult> = {
    import: finish(a, importCore(a)),
    manufacture: finish(a, manufactureCore(a)),
    hybrid: finish(a, hybridCore(a)),
  };
  const recommendation = recommend(a, routes);
  const best =
    recommendation.route === "skip"
      ? Object.values(routes).sort((x, y) => y.marginPct - x.marginPct)[0]!
      : routes[recommendation.route];
  return { routes, recommendation, best };
}

/** How the best route's contribution moves under common stresses. */
export function sensitivity(
  a: Assumptions,
): { label: string; contribution: number; deltaPct: number }[] {
  const base = computeEconomics(a);
  const route = base.best!.route;
  const stress = (label: string, f: (x: Assumptions) => void) => {
    const c = structuredClone(a);
    f(c);
    const v = computeEconomics(c).routes[route].contribution;
    return {
      label,
      contribution: r2(v),
      deltaPct:
        base.best!.contribution !== 0
          ? r2(((v - base.best!.contribution) / Math.abs(base.best!.contribution)) * 100)
          : 0,
    };
  };
  return [
    stress("Selling price -10%", (x) => {
      x.sellingPriceInr *= 0.9;
    }),
    stress("Supplier price +10%", (x) => {
      x.import.fobAmount *= 1.1;
      x.manufacture.bomInr *= 1.1;
    }),
    stress("Ad spend +5 points", (x) => {
      x.adSpendPct += 5;
    }),
    stress("Returns +5 points", (x) => {
      x.returnsRatePct += 5;
    }),
    stress("INR weakens 5%", (x) => {
      x.import.fxInrPerUnit *= 1.05;
    }),
  ];
}

// ------------------------------------------------------------------ duty / fee groups
export const DUTY_GROUPS = [
  "general",
  "plastics",
  "kitchen-steel",
  "drinkware",
  "electronics",
  "cosmetics",
  "decor-candles",
  "water-purification",
] as const;
export type DutyGroup = (typeof DUTY_GROUPS)[number];

/** Maps a lag group (see lagGroupFor) to the duty/fee table group. */
export function dutyGroupFor(lagGroup: string): DutyGroup {
  const m: Record<string, DutyGroup> = {
    kitchen: "kitchen-steel",
    tech: "electronics",
    beauty: "cosmetics",
    drinkware: "drinkware",
    home: "decor-candles",
    water: "water-purification",
  };
  return m[lagGroup] ?? "general";
}

/** Component scores that feed India Opportunity (0-100). */
export function marginComponent(marginPct: number): number {
  return Math.round(Math.min(100, Math.max(0, (marginPct / 35) * 100)) * 10) / 10;
}
export function priceFitComponent(
  sellingPriceInr: number,
  range: { min: number; max: number } | null,
): number | null {
  if (!range) return null;
  if (sellingPriceInr <= range.max) return 100;
  return (
    Math.round(Math.max(0, 100 * (1 - (sellingPriceInr - range.max) / (0.5 * range.max))) * 10) / 10
  ); // 0 at 150% of the top of the range
}
