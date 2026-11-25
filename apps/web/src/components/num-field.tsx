"use client";

export function NumField({
  label,
  value,
  onChange,
  unit,
  help,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  help?: string;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block text-sm" title={help}>
      <span className="text-muted-foreground">{label}</span>
      <span className="mt-0.5 flex items-center gap-1">
        {unit === "₹" && <span className="text-muted-foreground">₹</span>}
        <input
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm tabular-nums"
          aria-label={label}
        />
        {unit && unit !== "₹" && <span className="text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm" title={help}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{" "}
      {label}
    </label>
  );
}
