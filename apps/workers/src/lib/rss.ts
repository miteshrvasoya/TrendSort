import { XMLParser } from "fast-xml-parser";

export interface RssItem {
  title: string;
  link: string;
  publishedAt: string | null;
  source: string | null;
  approxTraffic?: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
  trimValues: true,
});
const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: unknown): string =>
  typeof x === "string"
    ? x
    : typeof x === "object" && x && "#text" in x
      ? String((x as Record<string, unknown>)["#text"])
      : x == null
        ? ""
        : String(x);

/** Parses RSS 2.0 (and simple Atom). Returns headline, link, date and publisher only; never article bodies. */
export function parseRss(xml: string): RssItem[] {
  const doc = parser.parse(xml);
  const rssItems = arr(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems
      .map((i: Record<string, unknown>) => {
        const d = txt(i.pubDate);
        const t = d ? new Date(d) : null;
        return {
          title: txt(i.title),
          link: txt(i.link),
          publishedAt: t && !isNaN(+t) ? t.toISOString() : null,
          source: txt(i.source) || null,
          approxTraffic: txt(i["ht:approx_traffic"]) || null,
        };
      })
      .filter((i) => i.title && i.link);
  }
  return arr(doc?.feed?.entry)
    .map((e: Record<string, unknown>) => {
      const link =
        arr(e.link as Record<string, string> | Record<string, string>[])[0]?.["@_href"] ?? "";
      const d = txt(e.updated ?? e.published);
      const t = d ? new Date(d) : null;
      return {
        title: txt(e.title),
        link,
        publishedAt: t && !isNaN(+t) ? t.toISOString() : null,
        source: null,
      };
    })
    .filter((i) => i.title && i.link);
}
