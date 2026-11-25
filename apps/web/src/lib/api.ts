export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !location.pathname.startsWith("/login")
  )
    location.href = "/login";
  if (!res.ok)
    throw new ApiError(res.status, (await res.json().catch(() => ({})))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

export interface TrendRow {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  subCategory: string | null;
  verticalKeys: string[];
  occasionKeys: string[];
  priceBandInr: string | null;
  isSample: boolean;
  momentum: number | null;
  breadth: number | null;
  sustainability: number | null;
  commercialProof: number | null;
  opportunity: number | null;
  adoptionStage: string | null;
  lagMonths: number | null;
  confidence: number | null;
  algorithmVersion: string | null;
  status: string;
  origin: string;
  newsCount: number;
  productCount: number;
  lastSignalAt: string | null;
}
export interface SourceRow {
  id: number;
  key: string;
  name: string;
  type: string;
  method: string;
  scraped: boolean;
  enabled: boolean;
  reliability: number;
  limitCalls: number;
  limitWindow: string;
  termsNote: string | null;
  phase: number;
  status: string;
  usedToday: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  confidenceLevel: string;
  implemented: boolean;
  runnable: boolean;
}
export interface NewsRow {
  id: number;
  trendId: number | null;
  headline: string;
  publisher: string | null;
  publishedAt: string | null;
  url: string;
}
export interface ProductRow {
  id: number;
  marketplace: string;
  country: string;
  title: string;
  url: string | null;
  price: number | null;
  currency: string | null;
  rating: number | null;
  reviewCount: number | null;
  rank: number | null;
  prevRank: number | null;
  listType: string | null;
  fetchedAt: string;
  scraped: boolean | null;
}
export interface RunRow {
  id: number;
  source: string;
  status: string;
  startedAt: string;
  items: number;
  error: string | null;
}
export interface VersionRow {
  version: string;
  releasedOn: string;
  title: string;
  summary: string;
  added: string[];
  changed: string[];
  fixed: string[];
  removed: string[];
  forYou: string;
}
