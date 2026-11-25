import { IMPORT_LEAD_DAYS } from "./scoring";

// ------------------------------------------------------------------ taxonomy
export const RECIPIENTS = [
  "mother",
  "father",
  "partner",
  "sibling",
  "kid",
  "boss",
  "teacher",
  "friend",
  "colleague",
  "self",
] as const;
export const AGE_GROUPS = ["kids", "teens", "adults", "seniors"] as const;
export const INTERESTS = [
  "home",
  "tech",
  "wellness",
  "beauty",
  "food-drink",
  "fashion",
  "pets",
  "outdoors",
  "kitchen",
  "decor",
  "kids-play",
] as const;
export const PERSONALISATION = ["none", "light", "full"] as const;
export type Recipient = (typeof RECIPIENTS)[number];
export type AgeGroup = (typeof AGE_GROUPS)[number];
export type Interest = (typeof INTERESTS)[number];
export type Personalisation = (typeof PERSONALISATION)[number];

export const PERSONALISATION_LABEL: Record<Personalisation, string> = {
  none: "Ready-made",
  light: "Light (name / initial / message)",
  full: "Fully custom (photo, design)",
};

// ------------------------------------------------------------------ budget bands (INR)
export const BUDGET_BANDS = [
  { key: "u500", label: "Under ₹500", min: 0, max: 500 },
  { key: "500-1000", label: "₹500–1,000", min: 500, max: 1000 },
  { key: "1000-1500", label: "₹1,000–1,500", min: 1000, max: 1500 },
  { key: "u1500", label: "Under ₹1,500", min: 0, max: 1500 },
  { key: "1500-3000", label: "₹1,500–3,000", min: 1500, max: 3000 },
  { key: "3000-5000", label: "₹3,000–5,000", min: 3000, max: 5000 },
  { key: "5000+", label: "₹5,000+", min: 5000, max: Infinity },
] as const;
export type BudgetKey = (typeof BUDGET_BANDS)[number]["key"];

export interface PriceRange {
  min: number;
  max: number;
}

/** A product fits a budget when its INR range overlaps the band. */
export function fitsBudget(range: PriceRange | null, band: BudgetKey): boolean {
  if (!range) return false;
  const b = BUDGET_BANDS.find((x) => x.key === band);
  return !!b && range.min < b.max && range.max >= b.min;
}

/** "₹800–2,000" or "₹600–1,800/qtr" -> {min,max}. null if unparseable. */
export function parseInrBand(s: string | null | undefined): PriceRange | null {
  if (!s) return null;
  const nums = [...s.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  return nums.length === 1
    ? { min: nums[0]!, max: nums[0]! }
    : { min: Math.min(nums[0]!, nums[1]!), max: Math.max(nums[0]!, nums[1]!) };
}

export const midpoint = (r: PriceRange) => (r.min + r.max) / 2;

// ------------------------------------------------------------------ gifting windows
export const SELLING_RUNWAY_DAYS = 21; // listing, photos, ads warm-up before the festival
export const MANUFACTURE_LEAD_DAYS = 45; // sampling + production + domestic freight

export type WindowStatus = "start_now" | "manufacture_only" | "missed";
export interface WindowInfo {
  festivalDate: string;
  daysToFestival: number;
  importDeadline: string; // latest date to place an import order
  manufactureDeadline: string; // latest date to start Indian manufacturing
  daysToImportDeadline: number;
  status: WindowStatus;
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function windowFor(festivalDate: string, today: Date): WindowInfo {
  const t = startOfDay(today);
  const f = new Date(festivalDate + "T00:00:00Z");
  const importBy = addDays(f, -(IMPORT_LEAD_DAYS + SELLING_RUNWAY_DAYS));
  const makeBy = addDays(f, -(MANUFACTURE_LEAD_DAYS + SELLING_RUNWAY_DAYS));
  const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
  const status: WindowStatus =
    t <= importBy ? "start_now" : t <= makeBy ? "manufacture_only" : "missed";
  return {
    festivalDate,
    daysToFestival: days(f, t),
    importDeadline: iso(importBy),
    manufactureDeadline: iso(makeBy),
    daysToImportDeadline: days(importBy, t),
    status,
  };
}

/** Next occurrence of each festival on or after `today`, soonest first. */
export function upcomingFestivals(
  festivals: {
    key: string;
    name: string;
    foreignEquivalent: string;
    gift_intensity: number;
    dates: Record<string, string>;
  }[],
  today: Date,
  horizonDays = 400,
) {
  const t = startOfDay(today).getTime();
  return festivals
    .map((f) => {
      const next = Object.values(f.dates)
        .filter((d) => new Date(d + "T00:00:00Z").getTime() >= t)
        .sort()[0];
      return next ? { ...f, date: next } : null;
    })
    .filter(
      (f): f is NonNullable<typeof f> =>
        f != null && (new Date(f.date + "T00:00:00Z").getTime() - t) / 86_400_000 <= horizonDays,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------------ sourcing hints (indicative, editable later)
const HINTS: Record<string, { hubs: string; route: string }> = {
  personalised: {
    hubs: "Rajkot, Surat, Delhi NCR (print / engraving); Yiwu / Shenzhen for blanks",
    route: "Hybrid: import blanks, personalise in India for speed and lower returns",
  },
  kitchen: {
    hubs: "Delhi NCR, Pune, Ahmedabad; Guangdong for appliances",
    route: "Import appliances; manufacture accessories (silicone, steel) locally",
  },
  tech: {
    hubs: "Shenzhen / Dongguan; Noida for assembly",
    route: "Import; check BIS / WPC certification before ordering",
  },
  wellness: {
    hubs: "Gujarat, Baddi, Delhi NCR (food-grade, blending); China for devices",
    route: "Manufacture consumables locally (FSSAI); import devices",
  },
  beauty: {
    hubs: "Baddi, Mumbai, Daman (cosmetics contract); Yiwu for tools",
    route: "White-label locally; import tools",
  },
  drinkware: {
    hubs: "Rajkot, Morbi, Ahmedabad (steel); Zhejiang for vacuum insulation",
    route: "Local steel bottles are competitive; import for premium finish",
  },
  home: {
    hubs: "Jaipur, Moradabad, Saharanpur (decor); Delhi NCR (candles)",
    route: "Manufacture locally; strong domestic craft base",
  },
  water: {
    hubs: "Delhi NCR, Pune, Ahmedabad (RO assembly); China for membranes / UV-C",
    route: "Hybrid: import key modules, assemble and certify in India (BIS)",
  },
  pet: {
    hubs: "Delhi NCR, Mumbai; Yiwu / Ningbo for accessories",
    route: "Import accessories; local for beds and treats",
  },
  general: {
    hubs: "Delhi NCR, Ahmedabad, Surat; Yiwu / Shenzhen",
    route: "Start with import samples, then evaluate local manufacture",
  },
};
export const sourcingHint = (group: string) => HINTS[group] ?? HINTS.general!;

// ------------------------------------------------------------------ bundles
export interface BundleCandidate {
  id: number;
  name: string;
  category: string | null;
  range: PriceRange;
  opportunity: number | null;
}
export interface Bundle {
  itemIds: number[];
  names: string[];
  sumInr: number;
  suggestedInr: number;
  discountPct: number;
  note: string;
}

export const BUNDLE_DISCOUNT_PCT = 10;
const round50 = (x: number) => Math.max(50, Math.round(x / 50) * 50);

/**
 * Builds hampers of 2-4 items from DIFFERENT categories (so they complement each other), best opportunity first.
 * suggestedInr = sum of item midpoints less a bundle discount, rounded to ₹50. Packaging cost is NOT included.
 */
export function buildBundles(
  items: BundleCandidate[],
  opts: { maxBundles?: number; budgetMax?: number; size?: number; discountPct?: number } = {},
): Bundle[] {
  const size = Math.min(4, Math.max(2, opts.size ?? 3));
  const discount = opts.discountPct ?? BUNDLE_DISCOUNT_PCT;
  const pool = [...items].sort(
    (a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1) || a.name.localeCompare(b.name),
  );
  const out: Bundle[] = [];
  const seen = new Set<string>();
  for (let start = 0; start < pool.length && out.length < (opts.maxBundles ?? 4); start++) {
    const picked: BundleCandidate[] = [pool[start]!];
    const cats = new Set([pool[start]!.category ?? `#${pool[start]!.id}`]);
    for (const c of pool) {
      if (picked.length >= size) break;
      const cat = c.category ?? `#${c.id}`;
      if (cats.has(cat) || picked.includes(c)) continue;
      const sum = picked.reduce((a, p) => a + midpoint(p.range), 0) + midpoint(c.range);
      if (opts.budgetMax != null && sum * (1 - discount / 100) > opts.budgetMax) continue;
      picked.push(c);
      cats.add(cat);
    }
    if (picked.length < 2) continue;
    const key = picked
      .map((p) => p.id)
      .sort()
      .join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const sum = picked.reduce((a, p) => a + midpoint(p.range), 0);
    out.push({
      itemIds: picked.map((p) => p.id),
      names: picked.map((p) => p.name),
      sumInr: Math.round(sum),
      suggestedInr: round50(sum * (1 - discount / 100)),
      discountPct: discount,
      note: `Sum of typical prices less ${discount}% bundle discount; excludes packaging and hamper box.`,
    });
  }
  return out;
}

// ------------------------------------------------------------------ corporate
export interface PriceBreak {
  qty: number;
  discountPct: number;
}
export const DEFAULT_PRICE_BREAKS: PriceBreak[] = [
  { qty: 25, discountPct: 0 },
  { qty: 50, discountPct: 5 },
  { qty: 100, discountPct: 10 },
  { qty: 250, discountPct: 15 },
  { qty: 500, discountPct: 20 },
];

/** Unit price for a quantity: the largest break at or below qty. null when under the first break (MOQ not met). */
export function priceAtQty(
  unitInr: number,
  qty: number,
  breaks: PriceBreak[] = DEFAULT_PRICE_BREAKS,
): { unit: number; total: number; discountPct: number } | null {
  const sorted = [...breaks].sort((a, b) => a.qty - b.qty);
  const hit = [...sorted].reverse().find((b) => qty >= b.qty);
  if (!hit) return null;
  const unit = Math.round(unitInr * (1 - hit.discountPct / 100) * 100) / 100;
  return { unit, total: Math.round(unit * qty * 100) / 100, discountPct: hit.discountPct };
}

export interface CorporateInfo {
  moq: number;
  branding: string[];
  leadTimeDays: number;
  priceBreaks: PriceBreak[];
}
export const BRANDING_OPTIONS = [
  "logo print",
  "laser engraving",
  "embroidery",
  "custom box / sleeve",
  "personalised card",
] as const;
