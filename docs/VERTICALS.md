# Verticals (v0.6.0)

A vertical is a JSON file in `packages/shared/src/data/verticals/`, validated by `verticalConfigSchema` at load and registered in `packages/shared/src/verticals.ts`. To add one: create the file, import it in `verticals.ts`, run `pnpm db:seed`.

| Field           | Used for                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `keywords`      | search themes for the vertical (shown and editable)                                                                              |
| `newsQueries`   | default Google News queries when you have tracked nothing yet (workers read these, with your overrides)                          |
| `presetWeights` | the vertical's Opportunity weighting (`/trends?vertical=x&preset=vertical`)                                                      |
| `indiaFitNotes` | extra, informational India-fit checks appended to every trend in the vertical (no score effect)                                  |
| `features`      | optional feature taxonomy for the gap matrix: `matchTerm` links a feature to a trend, `indiaPresence` 0-3 is an analyst estimate |
| `starterTrends` | one-click tracked trends (name + search keywords), each tied to a feature                                                        |
| `waterProfiles` | optional water-type guide with a good/partial/poor fit per feature (RO)                                                          |
| `tools`         | optional tools shown on the vertical page (`subscription`)                                                                       |

**Overrides** (edited in the app, stored in `verticals.overrides`, never overwritten by seeding) can change `keywords`, `newsQueries`, `presetWeights` and `featurePresence`. Defaults stay in the repo; Reset clears overrides.

**Feature gap** = foreign momentum (the trend's foreign-momentum component) × (3 − India presence) ÷ 3. A feature with no scored trend has no gap. India presence is a rough, category-level estimate, not brand-level market research: edit it.

**Water-type guide** is generic guidance (low-TDS municipal, mixed, high-TDS borewell), not a water test. Always test the actual water.

**Subscription calculator** is pure maths on your own inputs (`subscriptionEconomics`); defaults are placeholders.
