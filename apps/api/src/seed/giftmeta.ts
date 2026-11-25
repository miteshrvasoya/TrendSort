import type { AgeGroup, Interest, Personalisation, Recipient } from "@trendbridge/shared";

export interface GiftMeta {
  recipients: Recipient[];
  ages: AgeGroup[];
  interests: Interest[];
  pers: Personalisation;
  corporate?: boolean;
}
const m = (
  recipients: Recipient[],
  ages: AgeGroup[],
  interests: Interest[],
  pers: Personalisation,
  corporate = false,
): GiftMeta => ({ recipients, ages, interests, pers, corporate });

/** Analyst-assigned attributes for the sample gift trends (synthetic demo data, like the trends themselves). */
export const GIFT_META: Record<string, GiftMeta> = {
  "Personalised star map frame": m(["partner", "mother", "friend"], ["adults"], ["decor"], "full"),
  "Custom birth-flower jewellery": m(
    ["mother", "sibling", "partner", "friend"],
    ["adults", "teens"],
    ["fashion"],
    "light",
  ),
  "Engraved wooden keepsake box": m(
    ["partner", "mother", "father"],
    ["adults", "seniors"],
    ["decor", "home"],
    "full",
    true,
  ),
  "Photo projection keychain": m(
    ["partner", "friend", "sibling"],
    ["teens", "adults"],
    ["tech"],
    "full",
  ),
  "Smart ring (health tracking)": m(
    ["partner", "father", "boss"],
    ["adults"],
    ["tech", "wellness"],
    "none",
    true,
  ),
  "Insulated tumbler with handle (40oz)": m(
    ["friend", "sibling", "colleague"],
    ["teens", "adults"],
    ["outdoors", "food-drink"],
    "light",
    true,
  ),
  "Mushroom coffee gift set": m(
    ["father", "friend", "boss"],
    ["adults"],
    ["food-drink", "wellness"],
    "none",
    true,
  ),
  "Scented soy candle trio": m(
    ["mother", "friend", "teacher", "colleague"],
    ["adults"],
    ["home", "decor"],
    "light",
    true,
  ),
  "Desktop zen sand garden": m(
    ["boss", "colleague", "friend"],
    ["adults"],
    ["decor", "wellness"],
    "none",
    true,
  ),
  "Reusable ice-cube silicone gift bundle": m(
    ["friend", "mother"],
    ["adults"],
    ["kitchen", "home"],
    "none",
  ),
  "Customised pet portrait (illustrated)": m(
    ["friend", "partner", "self"],
    ["adults", "teens"],
    ["pets", "decor"],
    "full",
  ),
  "Matcha starter kit": m(
    ["friend", "mother", "boss"],
    ["adults"],
    ["food-drink", "wellness"],
    "none",
    true,
  ),
  "Kids' DIY gem-painting kit": m(["kid", "sibling"], ["kids"], ["kids-play"], "none"),
  "Weighted blanket (adult)": m(
    ["partner", "mother", "father"],
    ["adults", "seniors"],
    ["wellness", "home"],
    "none",
  ),
  "Digital photo frame with app upload": m(
    ["mother", "father", "partner"],
    ["seniors", "adults"],
    ["tech", "decor"],
    "light",
  ),
  "Leather desk mat (personalised)": m(
    ["boss", "colleague", "partner", "father"],
    ["adults"],
    ["tech", "decor"],
    "full",
    true,
  ),
  "Miniature terrarium kit": m(
    ["friend", "teacher", "kid"],
    ["teens", "adults", "kids"],
    ["home", "decor"],
    "none",
  ),
  "Self-care subscription box (curated)": m(
    ["sibling", "mother", "partner", "friend"],
    ["adults", "teens"],
    ["beauty", "wellness"],
    "light",
  ),
  "UV-C water bottle self-cleaning": m(
    ["colleague", "friend", "father"],
    ["adults"],
    ["outdoors", "wellness", "tech"],
    "light",
    true,
  ),
  "Hydrogen-rich water bottle": m(
    ["father", "mother", "boss"],
    ["adults", "seniors"],
    ["wellness", "tech"],
    "none",
  ),
  "Gua sha + ice roller facial set": m(
    ["mother", "sibling", "partner", "friend"],
    ["adults", "teens"],
    ["beauty", "wellness"],
    "none",
  ),
};
