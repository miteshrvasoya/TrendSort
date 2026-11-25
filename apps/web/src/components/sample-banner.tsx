import { FlaskConical } from "lucide-react";

export function SampleBanner() {
  return (
    <div
      data-tour="sample-banner"
      className="flex items-center gap-2 rounded-lg border border-dashed border-warn bg-warn/10 px-3 py-2 text-sm text-warn"
    >
      <FlaskConical size={16} />
      <span>
        <strong>Sample data.</strong> Trends, series and scores below are synthetic demo values, not
        market truth. Track a trend and run sources to see real signals.
      </span>
    </div>
  );
}
