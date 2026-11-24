import { Badge } from "./ui/badge";

const map = { high: "ok", medium: "warn", low: "danger", sample: "sample" } as const;
export function ConfidenceBadge({ level }: { level: string }) {
  const tone = map[level as keyof typeof map] ?? "neutral";
  const tip = level === "sample" ? "Synthetic sample data" : `${level} confidence`;
  return (
    <Badge tone={tone} title={tip}>
      {level}
    </Badge>
  );
}
