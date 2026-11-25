/** Rule-based review mining. No LLM (Rs 0): themes come from a keyword lexicon, counted per review, negation-aware. */
export interface Theme {
  key: string;
  label: string;
  polarity: "praise" | "complaint";
  re: RegExp;
  improve?: string;
}

const praise = (key: string, label: string, re: RegExp): Theme => ({
  key,
  label,
  polarity: "praise",
  re,
});
const complaint = (key: string, label: string, re: RegExp, improve: string): Theme => ({
  key,
  label,
  polarity: "complaint",
  re,
  improve,
});

export const THEMES: Theme[] = [
  praise(
    "quality",
    "Good build quality",
    /\b(sturdy|well[- ]made|good quality|high quality|durable|solid build|premium (feel|quality)|excellent quality)\b/,
  ),
  praise(
    "looks",
    "Looks great",
    /\b(beautiful|gorgeous|looks (great|amazing|nice|good)|stylish|elegant|pretty|love the (look|design))\b/,
  ),
  praise(
    "easy",
    "Easy to use or set up",
    /\b(easy to (use|set ?up|clean|install|assemble)|simple to use|user[- ]friendly)\b/,
  ),
  praise(
    "value",
    "Good value",
    /\b(worth (the|every)|great value|good value|value for money|affordable|good price)\b/,
  ),
  praise(
    "gift",
    "Makes a great gift",
    /\b(great gift|perfect gift|loved (it|the gift)|gift(ed)? (to|for) my|she loved|he loved|recipient loved)\b/,
  ),
  praise("size", "Right size", /\b(perfect size|fits (perfectly|well)|nice size|just right)\b/),
  praise(
    "performance",
    "Works well",
    /\b(works (great|perfectly|well|as expected)|powerful|very effective|long battery|battery (lasts|life is (great|good)))\b/,
  ),
  praise(
    "packaging",
    "Well packaged",
    /\b(well packed|nicely packaged|great packaging|came well packed)\b/,
  ),
  complaint(
    "breaks",
    "Breaks or feels flimsy",
    /\b(broke|broken|cracked|flimsy|fell apart|cheaply made|poor quality|low quality|not sturdy|snapped|falls apart|came apart)\b/,
    "Use sturdier materials and reinforce weak joints; add a drop test to QC.",
  ),
  complaint(
    "stopped",
    "Stopped working or defective",
    /\b(stopped working|dead on arrival|doa|won'?t turn on|died after|malfunction|defective|faulty)\b/,
    "Tighten QC with burn-in testing and offer a replacement warranty.",
  ),
  complaint(
    "battery",
    "Poor battery life",
    /\b(battery (drains|dies|doesn'?t last|life is (poor|bad|short))|short battery|charges? (slowly|poorly))\b/,
    "Use a larger battery or reduce power draw; state realistic battery life.",
  ),
  complaint(
    "size_issue",
    "Size not as expected",
    /\b(too (small|big|large|tiny)|smaller than (expected|pictured)|runs small|sizing)\b/,
    "Show true-scale photos and a size guide; consider a size range.",
  ),
  complaint(
    "leaks",
    "Leaks",
    /\bleak(s|ed|ing)?\b/,
    "Improve seals and gaskets and pressure-test every unit.",
  ),
  complaint(
    "misleading",
    "Not as described",
    /\b(not as (described|pictured|shown)|misleading|looks different|false advertising)\b/,
    "Make photos and copy match the real product.",
  ),
  complaint(
    "setup",
    "Hard to set up",
    /\b(hard to (assemble|install|set ?up|use)|confusing|instructions? (unclear|poor|missing)|difficult to (assemble|install))\b/,
    "Add clear instructions or a video and simplify assembly.",
  ),
  complaint(
    "smell",
    "Bad smell",
    /\b(smells? (bad|like chemicals|strong|weird)|chemical smell)\b/,
    "Use food-safe, low-VOC materials and air out before shipping.",
  ),
  complaint(
    "noisy",
    "Noisy",
    /\b(noisy|too loud|rattl(es|ing))\b/,
    "Add damping or a quieter motor.",
  ),
  complaint(
    "fading",
    "Fades or peels",
    /\b(fad(es|ed|ing)|peeling|peeled|rubs off|scratch(es|ed)? easily)\b/,
    "Use a more durable coating or print process.",
  ),
  complaint(
    "price",
    "Feels overpriced",
    /\b(overpriced|too expensive|not worth|waste of money)\b/,
    "Reposition the price or add visible value (accessory, warranty).",
  ),
  complaint(
    "shipping",
    "Damaged in shipping",
    /\b(arrived (damaged|broken|crushed)|damaged (in|during) (shipping|transit))\b/,
    "Strengthen packaging and add protective inserts.",
  ),
];

const NEG = /\b(not|no|never|isn'?t|wasn'?t|doesn'?t|didn'?t|don'?t|without|zero)\b[^.!?]{0,20}$/;

export interface ReviewIn {
  rating: number;
  text: string;
}
export interface ThemeStat {
  key: string;
  label: string;
  count: number;
  share: number;
  examples: string[];
  improve?: string;
}
export interface ReviewAnalysis {
  n: number;
  avgRating: number;
  lowRatingShare: number;
  ratingCounts: Record<string, number>;
  praise: ThemeStat[];
  complaints: ThemeStat[];
  suggestions: string[];
  caveat: string | null;
}

const clip = (s: string) => (s.length > 140 ? s.slice(0, 137).trimEnd() + "…" : s);

/** Counts each theme at most once per review; a match preceded by a negation ("doesn't leak") is ignored. */
export function analyseReviews(reviews: ReviewIn[]): ReviewAnalysis | null {
  const n = reviews.length;
  if (n === 0) return null;
  const stats = new Map<string, ThemeStat>(
    THEMES.map((t) => [
      t.key,
      { key: t.key, label: t.label, count: 0, share: 0, examples: [], improve: t.improve },
    ]),
  );
  for (const r of reviews) {
    const text = r.text.toLowerCase();
    for (const t of THEMES) {
      const re = new RegExp(t.re.source, "g");
      let m: RegExpExecArray | null;
      let hit = false;
      while ((m = re.exec(text))) {
        const before = text.slice(Math.max(0, m.index - 30), m.index);
        if (NEG.test(before)) continue;
        hit = true;
        const st = stats.get(t.key)!;
        if (st.examples.length < 2) {
          const start = Math.max(text.lastIndexOf(".", m.index) + 1, 0);
          const endRaw = text.indexOf(".", m.index);
          st.examples.push(
            clip(r.text.slice(start, endRaw === -1 ? undefined : endRaw + 1).trim()),
          );
        }
        break;
      }
      if (hit) stats.get(t.key)!.count++;
    }
  }
  const all = [...stats.values()].map((s) => ({ ...s, share: s.count / n }));
  const top = (pol: "praise" | "complaint") =>
    all
      .filter((s) => THEMES.find((t) => t.key === s.key)!.polarity === pol && s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  const complaints = top("complaint");
  const ratingCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of reviews) ratingCounts[String(Math.min(5, Math.max(1, Math.round(r.rating))))]!++;
  return {
    n,
    avgRating: Math.round((reviews.reduce((s, r) => s + r.rating, 0) / n) * 100) / 100,
    lowRatingShare: (ratingCounts["1"]! + ratingCounts["2"]!) / n,
    ratingCounts,
    praise: top("praise"),
    complaints,
    suggestions: complaints
      .filter((c) => c.share >= 0.05)
      .map(
        (c) =>
          `${Math.round(c.share * 100)}% of reviews mention "${c.label.toLowerCase()}": ${c.improve}`,
      ),
    caveat:
      n < 20
        ? `Only ${n} review${n === 1 ? "" : "s"}: treat these themes as hints, not findings.`
        : null,
  };
}
