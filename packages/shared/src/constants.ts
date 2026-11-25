/** Lead-time constants shared by scoring, gifts and economics. */
export const IMPORT_LEAD_DAYS = 84; // order + production + sea/air freight + clearance
export const MANUFACTURE_LEAD_DAYS_DEFAULT = 45; // sampling + production + domestic freight

/** Sources that have a working connector the queue can run in this version. */
export const RUNNABLE_SOURCE_KEYS = [
  "ecb_fx",
  "google_trends",
  "google_trends_rss",
  "google_news_rss",
  "trade_press_rss",
  "amazon_bestsellers",
  "etsy",
] as const;
