import { parse } from "csv-parse/sync";
import { IMPORT_SCHEMAS, type ImportKind } from "@trendbridge/shared";

export interface ParsedImport {
  rows: Record<string, unknown>[];
  errors: { row: number; message: string }[];
  total: number;
}

/** Parses CSV/JSON text and validates every row with Zod. Never throws on bad rows; reports them. */
export function parseImport(kind: ImportKind, format: "csv" | "json", text: string): ParsedImport {
  let raw: unknown[];
  try {
    raw =
      format === "csv"
        ? (parse(text, {
            columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()),
            skip_empty_lines: true,
            trim: true,
            bom: true,
          }) as unknown[])
        : (() => {
            const j = JSON.parse(text);
            return Array.isArray(j) ? j : [j];
          })();
  } catch (e) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Could not parse ${format.toUpperCase()}: ${e instanceof Error ? e.message : e}`,
        },
      ],
      total: 0,
    };
  }
  const schema = IMPORT_SCHEMAS[kind];
  const rows: Record<string, unknown>[] = [];
  const errors: ParsedImport["errors"] = [];
  raw.slice(0, 5000).forEach((r, i) => {
    const res = schema.safeParse(r);
    if (res.success) rows.push(res.data as Record<string, unknown>);
    else
      errors.push({
        row: i + 1,
        message: res.error.issues
          .map((x) => `${x.path.join(".") || "row"}: ${x.message}`)
          .join("; "),
      });
  });
  if (raw.length > 5000)
    errors.push({ row: 5001, message: "Only the first 5000 rows are processed per import" });
  return { rows, errors, total: raw.length };
}
