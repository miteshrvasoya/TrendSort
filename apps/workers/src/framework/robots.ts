/** Minimal robots.txt parser: longest-match Allow/Disallow for our UA, falling back to `*`. */
export interface RobotsRules {
  rules: { allow: boolean; path: string }[];
}

export function parseRobots(txt: string, ua: string): RobotsRules {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if ((k === "allow" || k === "disallow") && cur) {
      lastWasAgent = false;
      if (v) cur.rules.push({ allow: k === "allow", path: v });
      else if (k === "disallow") {
        /* empty disallow = allow all */
      }
    } else lastWasAgent = false;
  }
  const name = ua.toLowerCase().split(/[\s/]/)[0] ?? "";
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && name.includes(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  return { rules: (specific ?? star)?.rules ?? [] };
}

function matches(pattern: string, path: string): boolean {
  const end = pattern.endsWith("$");
  const re = new RegExp(
    "^" +
      pattern
        .replace(/\$$/, "")
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      (end ? "$" : ""),
  );
  return re.test(path);
}

export function isAllowed(r: RobotsRules, pathAndQuery: string): boolean {
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of r.rules) {
    if (matches(rule.path, pathAndQuery)) {
      const len = rule.path.length;
      if (!best || len > best.len || (len === best.len && rule.allow))
        best = { allow: rule.allow, len };
    }
  }
  return best ? best.allow : true;
}
