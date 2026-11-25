/** Source of truth for release notes. Synced into `app_versions` + `release_notes` at API start. */
export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
  /** Plain-language "what this means for you". */
  forYou: string;
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "0.4.0",
    date: "2026-11-27",
    title: "Gifts vertical",
    summary:
      "A Gifts section built for 'what should I source for Diwali under ₹1,500?': browse by occasion, recipient, budget, age, interest and personalisation, with sourcing deadlines, hampers and corporate bulk pricing.",
    added: [
      "Gifts browser: filters for occasion (festivals and evergreen), recipient, INR budget band, age, interest, personalisation and corporate-friendly; hides gifts already Mainstream/Saturated in India (toggle)",
      "Gifting windows: for each upcoming Indian festival, the latest date to place an import order and to start Indian manufacturing, and which unsaturated gifts fit",
      "Gift of the week: the top-opportunity gift whose import window is still open, with the reason",
      "Bundles: 2-4 item hampers from different categories with a suggested price (10% bundle discount, editable assumption)",
      "Corporate gifting: MOQ, branding options, lead time and a bulk price-break calculator",
      "Gift details editor on every live trend (occasions, recipients, ages, interests, price range, corporate terms)",
      "Etsy connector (official API, needs a free key) and Amazon Most Gifted / Most Wished For lists",
      "Source Registry shows 'needs key' for sources that require an API key",
    ],
    changed: ["Sample gift trends now carry gift attributes so every filter works on demo data"],
    fixed: [],
    removed: [],
    forYou:
      "Pick a festival and a budget and see which gifts are rising abroad but not yet mainstream in India, when you must order by, and what hamper to build. Margin estimates and landed cost arrive in v0.5, so each gift shows a sourcing hint but not yet a margin. Etsy data needs your free Etsy API key.",
  },
  {
    version: "0.3.0",
    date: "2026-11-26",
    title: "Scoring and the India lag model",
    summary:
      "Every trend now gets Momentum, Breadth, Sustainability, Commercial proof, an India adoption stage and an India Opportunity score, each explainable, with confidence and weights you control.",
    added: [
      "Scores computed by the Python analytics service: seasonality-adjusted momentum, sustainability (fad vs steady), breadth, marketplace-based commercial proof",
      "India adoption stage (Not visible to Saturated) from India's search interest relative to the foreign peak",
      "India lag model: category lag from a 30-case back-test (analyst estimates, clearly labelled) with an 80% interval, plus a measure-lag job that replaces estimates with Google Trends measurements",
      "Scoring page: eight weight sliders, plain-language methodology, back-test table",
      "'Why this score' panel on every trend: inputs, weights, contributions, coverage, confidence breakdown and score history",
      "Confidence badges and hover explanations on every score column",
      "Re-score button and a daily scoring job",
    ],
    changed: [
      "Google Trends is now fetched as one compare request per keyword, so all countries share one scale and India vs foreign is directly comparable",
      "Placeholder sample scores are gone; sample trends are scored by the real model and stay labelled Sample",
      "Opportunity ignores inputs that have no data yet instead of guessing, and says how much of the weight it is based on",
    ],
    fixed: [],
    removed: ["Placeholder 'sample-0' scores"],
    forYou:
      "You can now rank trends by how early India is, see exactly why each score is what it is, and tune the weights to your own priorities. Margin, price fit, regulation and logistics join the score in v0.5; until then Opportunity covers only the demand and timing side, and says so. Back-test lags are my estimates until you run the measure-lag job.",
  },
  {
    version: "0.2.0",
    date: "2026-11-25",
    title: "Signals MVP",
    summary:
      "Real data starts to flow: Google Trends, Google News and trade-press feeds, Amazon list pages (opt-in), plus a CSV/JSON import screen. You can now track your own trends.",
    added: [
      "Track a trend: name it, add keywords and countries, and Google Trends interest is pulled for them",
      "Connectors: Google Trends, Google Trends daily RSS, Google News RSS, trade-press and Indian D2C RSS, Amazon Best Sellers / New Releases / Movers (off by default)",
      "Auto-created candidate trends from Movers & Shakers, with approve / dismiss",
      "Trend detail page: multi-country chart, news timeline, marketplace products with rank change",
      "Import screen (CSV or JSON) with templates and row-by-row validation for products and time series",
      "Source Registry: enable/disable switch, Run now, recent run history",
      "Trend Explorer filters for real vs sample data and candidates",
    ],
    changed: [
      "Real signals never match sample trends; sample and real data are filtered separately",
      "Scraped sources are now disabled until you switch them on",
    ],
    fixed: [],
    removed: [],
    forYou:
      "You can add the products and ideas you care about and watch real search interest and news for them. Google Trends values are relative within each country, so compare shapes, not magnitudes. Scores are still placeholders until Phase 2.",
  },
  {
    version: "0.1.0",
    date: "2026-11-24",
    title: "Foundations",
    summary:
      "The platform skeleton: sign-in, dashboard shell, source registry, connector framework, background jobs, sample data, and the What's New + guided tour system.",
    added: [
      "Monorepo with web, API, workers and a Python analytics service",
      "Single-user login (sample admin account)",
      "Dashboard shell with dark/light mode and a Trend Explorer preview on sample data",
      "Source Registry listing every planned data source with cost, reliability and free-tier usage meter",
      "Connector framework: robots.txt check, rate limit, circuit breaker, retries, audit log",
      "Live ECB exchange-rate connector (free, no key) as the first real data source",
      "34 sample trend entities with 2 years of synthetic weekly series, labelled 'Sample data'",
      "What's New modal, version history page, guided tour and Help menu",
    ],
    changed: [],
    fixed: [],
    removed: [],
    forYou:
      "You can sign in, look around the empty-but-working app, and see exactly which free data sources are planned. Sample data is for demos only; real signals start flowing in Phase 1.",
  },
];

export const CURRENT_VERSION = RELEASES[0]!.version;
