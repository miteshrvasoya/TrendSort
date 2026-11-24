import { CURRENT_VERSION, isNewFeature } from "@trendbridge/shared";
import { Badge } from "./ui/badge";

export function NewBadge({ since }: { since: string }) {
  if (!isNewFeature(since, CURRENT_VERSION)) return null;
  const [maj, min] = since.split(".");
  return (
    <Badge tone="primary" className="ml-2">
      New in v{maj}.{min}
    </Badge>
  );
}
