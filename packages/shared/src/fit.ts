/**
 * India fit rules. These are a CHECKLIST of things to verify, not legal advice and not a clearance.
 * Every regulatory line names the body to confirm with; rules change, so always check the official source.
 */
export interface FitAttrs {
  electrical: boolean;
  wireless: boolean;
  battery: boolean;
  foodContact: boolean;
  cosmetic: boolean;
  waterRelated: boolean;
  animalDerived: boolean;
  liquidOrHazmat: boolean;
  fragile: boolean;
  festiveColourSensitive: boolean;
  size: "small" | "medium" | "large";
}
export type FitStatus = "ok" | "check" | "action";
export interface FitCheck {
  key: string;
  title: string;
  status: FitStatus;
  detail: string;
  verifyWith: string;
  penalty: number;
}

export const EMPTY_FIT: FitAttrs = {
  electrical: false,
  wireless: false,
  battery: false,
  foodContact: false,
  cosmetic: false,
  waterRelated: false,
  animalDerived: false,
  liquidOrHazmat: false,
  fragile: false,
  festiveColourSensitive: false,
  size: "medium",
};

const T = (re: RegExp, s: string) => re.test(s);

/** Keyword heuristics from name + group + listing titles. A starting point you must review before it affects scores. */
export function inferFitAttrs(group: string, name: string, titles: string[] = []): FitAttrs {
  const s = `${name} ${group} ${titles.join(" ")}`.toLowerCase();
  const wireless = T(
    /smart|bluetooth|wi-?fi|iot|\bapp\b|tracker|\bring\b|digital (photo )?frame|wireless/,
    s,
  );
  const electrical =
    wireless ||
    T(
      /electric|\bled\b|uv-c|monitor|projection|lamp|vacuum|purifier|\bro\b|dispenser|massage|usb|charger|camera|watch|light therapy|red-light|heater|fryer|kettle/,
      s,
    );
  const waterRelated = group === "water" || T(/water|purif|\bro\b|filter|hydrogen|alkaline/, s);
  return {
    electrical,
    wireless,
    battery:
      wireless || T(/rechargeable|battery|cordless|projection|uv-c|hydrogen|led mask|red-light/, s),
    foodContact:
      T(
        /bottle|tumbler|cup|mug|bowl|tray|liner|coffee|matcha|tea\b|silicone|ice-cube|kitchen|food|spice|cartridge/,
        s,
      ) || waterRelated,
    cosmetic: T(/cosmetic|cream|serum|lotion|skincare (set|product)|perfume|lipstick/, s),
    waterRelated,
    animalDerived: T(/leather|silk|wool|gelatin|pearl|bone|ivory/, s),
    liquidOrHazmat: T(/candle|perfume|oil|aerosol|lithium/, s),
    fragile: T(/glass|frame|ceramic|terrarium|candle|crystal|projection|lamp|mirror|porcelain/, s),
    festiveColourSensitive: T(/gift|hamper|candle|diya|decor|frame|keepsake|box/, s),
    size: T(
      /purifier|dispenser|vacuum|blanket|under-sink|whole-house|desk mat|filter system|chair|desk\b/,
      s,
    )
      ? "large"
      : T(/\bring\b|keychain|jewel|liner|card|necklace|kit\b|pendant/, s)
        ? "small"
        : "medium",
  };
}

/** Known brand tokens to flag trademark / design-patent risk when they appear in foreign listing titles. Informational only. */
const BRANDS = [
  "stanley",
  "hydro flask",
  "yeti",
  "apple",
  "airtag",
  "dyson",
  "oura",
  "samsung",
  "philips",
  "instant pot",
  "ninja",
  "theragun",
  "hatch",
  "lego",
  "disney",
  "nike",
  "owala",
  "brita",
  "lifestraw",
];
export function detectBrands(titles: string[]): string[] {
  const s = titles.join(" ").toLowerCase();
  return BRANDS.filter((b) => new RegExp(`\\b${b}\\b`).test(s));
}

export function runFitChecks(a: FitAttrs, brandHits: string[] = []): FitCheck[] {
  const c: FitCheck[] = [];
  const add = (
    key: string,
    title: string,
    status: FitStatus,
    detail: string,
    verifyWith: string,
    penalty = 0,
  ) => c.push({ key, title, status, detail, verifyWith, penalty: status === "ok" ? 0 : penalty });

  add(
    "voltage",
    "Voltage and plug",
    a.electrical ? "action" : "ok",
    a.electrical
      ? "India mains is 230 V / 50 Hz with Type C/D/M sockets. Confirm the unit is rated for 230 V (or 100-240 V) and ships with a compliant plug; test a sample."
      : "No mains power involved.",
    "your supplier's rating plate; BIS",
    10,
  );
  add(
    "bis",
    "BIS certification",
    a.electrical || a.battery ? "check" : "ok",
    a.electrical || a.battery
      ? "Many electronics, chargers and batteries fall under BIS's Compulsory Registration Scheme (CRS). Check the current CRS product list for this HS code; registration adds cost and weeks."
      : "No BIS-regulated electrical component identified.",
    "BIS CRS product list",
    10,
  );
  add(
    "wpc",
    "Wireless approval (WPC)",
    a.wireless ? "action" : "ok",
    a.wireless
      ? "Wi-Fi / Bluetooth devices generally need WPC Equipment Type Approval (ETA) before import and sale."
      : "No wireless radio identified.",
    "WPC / DoT ETA portal",
    20,
  );
  add(
    "battery",
    "Batteries and air freight",
    a.battery ? "check" : "ok",
    a.battery
      ? "Lithium batteries may need BIS compliance and are restricted on air freight (dangerous-goods declarations). Plan sea freight or compliant packaging."
      : "No battery identified.",
    "BIS; your freight forwarder",
    10,
  );
  add(
    "food",
    "Food-contact / FSSAI",
    a.foodContact ? "check" : "ok",
    a.foodContact
      ? "Items touching food or drink may need food-safe material evidence, and food products need FSSAI import registration and compliant labelling."
      : "No food contact identified.",
    "FSSAI",
    10,
  );
  add(
    "cosmetic",
    "Cosmetics registration",
    a.cosmetic ? "action" : "ok",
    a.cosmetic
      ? "Imported cosmetics need CDSCO import registration under the Cosmetics Rules before sale."
      : "Not a cosmetic.",
    "CDSCO",
    25,
  );
  add(
    "water",
    "Water type and RO fit",
    a.waterRelated ? "check" : "ok",
    a.waterRelated
      ? "Indian water varies widely: borewell water can be very high in TDS and hardness, municipal water much lower. Confirm membranes and filters suit your target TDS range, address reject-water concerns, and plan for an AMC / filter-refill model. Check whether BIS applies to this appliance."
      : "Not water-related.",
    "BIS; local water-quality data",
    5,
  );
  add(
    "cultural",
    "Cultural and dietary fit",
    a.animalDerived ? "check" : "ok",
    a.animalDerived
      ? "Leather, silk, gelatin and similar materials can conflict with vegetarian, Jain or religious preferences; label materials clearly or offer an alternative."
      : "No animal-derived material identified.",
    "your target customers",
    5,
  );
  add(
    "colour",
    "Colour and festive preference",
    a.festiveColourSensitive ? "check" : "ok",
    a.festiveColourSensitive
      ? "For festive and wedding gifting, red, gold, yellow and green are generally favoured; avoid black or white as the dominant colour for auspicious occasions."
      : "Not colour-sensitive.",
    "festival-specific preferences",
    0,
  );
  add(
    "size",
    "Size and shipping",
    a.size === "large" ? "check" : "ok",
    a.size === "large"
      ? "Large or bulky items raise freight, storage and last-mile cost and returns damage."
      : "Size is manageable.",
    "your logistics quote",
    0,
  );
  add(
    "fragile",
    "Fragility",
    a.fragile ? "check" : "ok",
    a.fragile
      ? "Fragile goods need protective packaging; expect higher damage-related returns."
      : "Not especially fragile.",
    "packaging test",
    0,
  );
  add(
    "metrology",
    "Legal Metrology labelling",
    "check",
    "Imported packaged goods must carry the required declarations (MRP, importer name and address, country of origin, net quantity). Plan relabelling or compliant printed packaging.",
    "Legal Metrology (Packaged Commodities) Rules",
    3,
  );
  add(
    "import_policy",
    "Import policy and duty",
    "check",
    "Confirm the HS code's import policy (free / restricted / prohibited) and current duty on the official tariff before ordering.",
    "DGFT ITC-HS; CBIC / ICEGATE",
    2,
  );
  add(
    "trademark",
    "Trademark and design risk",
    brandHits.length ? "action" : "ok",
    brandHits.length
      ? `Foreign listings mention known brands (${brandHits.join(", ")}). Copying brand names, logos or protected designs can lead to takedowns or claims. Informational only: consult a lawyer.`
      : "No known brand names found in sample listings. This is not a clearance; run a trademark and design search.",
    "IP India trademark / design search; a lawyer",
    20,
  );
  return c;
}

/** Regulatory ease and logistics feasibility, both 0-100, from the checks. */
export function fitScores(
  checks: FitCheck[],
  a: FitAttrs,
): { regulatory: number; logistics: number } {
  const regulatory = Math.max(0, 100 - checks.reduce((s, x) => s + x.penalty, 0));
  const logistics = Math.max(
    0,
    100 -
      (a.size === "large" ? 30 : a.size === "medium" ? 10 : 0) -
      (a.fragile ? 15 : 0) -
      (a.battery ? 15 : 0) -
      (a.liquidOrHazmat ? 20 : 0) -
      (a.electrical ? 5 : 0),
  );
  return { regulatory, logistics };
}
