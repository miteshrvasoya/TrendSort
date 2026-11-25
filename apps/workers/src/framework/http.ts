import { auditLog, sources, type Db } from "@trendbridge/db";
import { eq } from "drizzle-orm";
import { isAllowed, parseRobots, type RobotsRules } from "./robots";

export class RobotsBlockedError extends Error {}
export class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export interface HttpOptions {
  userAgent: string;
  minIntervalMs?: number; // per host
  maxRetries?: number;
  baseBackoffMs?: number;
  respectRobots?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Polite HTTP: robots.txt, per-host throttle, retries with backoff on 429/5xx, audit log of every pull. */
export class PoliteHttp {
  calls = 0;
  private robotsCache = new Map<string, RobotsRules>();
  private lastHit = new Map<string, number>();
  private o: Required<HttpOptions>;

  constructor(
    private db: Db | null,
    private sourceKey: string,
    opts: HttpOptions,
  ) {
    this.o = {
      minIntervalMs: 1500,
      maxRetries: 3,
      baseBackoffMs: 1000,
      respectRobots: true,
      fetchImpl: fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ...opts,
    };
  }

  private async throttle(host: string) {
    const wait = (this.lastHit.get(host) ?? 0) + this.o.minIntervalMs - Date.now();
    if (wait > 0) await this.o.sleep(wait);
    this.lastHit.set(host, Date.now());
  }

  private async robotsFor(u: URL): Promise<RobotsRules> {
    const cached = this.robotsCache.get(u.host);
    if (cached) return cached;
    let rules: RobotsRules = { rules: [] };
    try {
      const res = await this.o.fetchImpl(`${u.protocol}//${u.host}/robots.txt`, {
        headers: { "user-agent": this.o.userAgent },
      });
      if (res.ok) rules = parseRobots(await res.text(), this.o.userAgent);
      else if (res.status >= 500) rules = { rules: [{ allow: false, path: "/" }] }; // be conservative if robots is unreachable
    } catch {
      rules = { rules: [{ allow: false, path: "/" }] };
    }
    this.robotsCache.set(u.host, rules);
    return rules;
  }

  private async audit(action: string, url: string, detail: object = {}) {
    if (!this.db) return;
    await this.db
      .insert(auditLog)
      .values({ actor: "worker", action, url, sourceKey: this.sourceKey, detail });
  }

  /** For calls made by third-party client libraries (e.g. the Google Trends wrapper): count + audit them. */
  async recordExternal(url: string, detail: object = {}) {
    this.calls++;
    await this.audit("fetch", url, { external: true, ...detail });
  }

  async get(
    url: string,
    init: { headers?: Record<string, string>; skipRobots?: boolean } = {},
  ): Promise<Response> {
    const u = new URL(url);
    // Official APIs (skipRobots) are exempt; page fetches never are.
    if (this.o.respectRobots && !init.skipRobots) {
      const rules = await this.robotsFor(u);
      if (!isAllowed(rules, u.pathname + u.search)) {
        await this.audit("robots_blocked", url);
        throw new RobotsBlockedError(`robots.txt disallows ${u.pathname}`);
      }
    }
    for (let attempt = 0; ; attempt++) {
      await this.throttle(u.host);
      this.calls++;
      const res = await this.o.fetchImpl(url, {
        headers: { "user-agent": this.o.userAgent, accept: "*/*", ...init.headers },
      });
      await this.audit("fetch", url, { status: res.status, attempt });
      if (res.status === 403 || res.status === 401)
        throw new HttpError(res.status, `Blocked (${res.status}); not attempting to bypass`);
      if ((res.status === 429 || res.status >= 500) && attempt < this.o.maxRetries) {
        const ra = Number(res.headers.get("retry-after"));
        await this.o.sleep(ra > 0 ? ra * 1000 : this.o.baseBackoffMs * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${u.host}`);
      return res;
    }
  }

  async json<T>(url: string, init?: Parameters<PoliteHttp["get"]>[1]): Promise<T> {
    return (await this.get(url, init)).json() as Promise<T>;
  }
}

export async function markSourceUsed(db: Db, key: string) {
  await db
    .update(sources)
    .set({ lastSuccessAt: new Date(), lastError: null, circuitState: "closed" })
    .where(eq(sources.key, key));
}
