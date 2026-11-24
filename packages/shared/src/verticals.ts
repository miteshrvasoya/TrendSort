/** Verticals are config, not code. */
export interface VerticalConfig {
  key: string;
  name: string;
  keywords: string[];
  sourceWeights: Record<string, number>;
  indiaFitRules: string[];
}

export const VERTICALS: VerticalConfig[] = [
  {
    key: "gifts",
    name: "Gifts",
    keywords: ["gift", "personalised", "hamper", "keepsake"],
    sourceWeights: { etsy: 1.3, amazon_bestsellers: 1.0, google_trends: 1.0 },
    indiaFitRules: ["festival-alignment", "budget-band"],
  },
  {
    key: "ro",
    name: "Water Purification / RO",
    keywords: ["water purifier", "reverse osmosis", "under-sink", "countertop", "UV-C", "alkaline"],
    sourceWeights: { google_trends: 1.2, amazon_bestsellers: 1.0 },
    indiaFitRules: ["tds", "borewell-vs-municipal", "reject-water", "amc-culture", "bis"],
  },
  {
    key: "home-kitchen",
    name: "Home & Kitchen",
    keywords: ["kitchen", "home", "organiser"],
    sourceWeights: { amazon_bestsellers: 1.2 },
    indiaFitRules: ["voltage-plug", "size"],
  },
  {
    key: "wellness",
    name: "Wellness",
    keywords: ["wellness", "supplement", "recovery"],
    sourceWeights: { google_trends: 1.2 },
    indiaFitRules: ["fssai", "cdsco"],
  },
  {
    key: "pet",
    name: "Pet",
    keywords: ["pet", "dog", "cat"],
    sourceWeights: { amazon_bestsellers: 1.1 },
    indiaFitRules: ["climate"],
  },
  {
    key: "beauty",
    name: "Beauty",
    keywords: ["skincare", "beauty", "haircare"],
    sourceWeights: { google_trends: 1.1 },
    indiaFitRules: ["cdsco", "skin-tone-climate"],
  },
];
