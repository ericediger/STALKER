import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent } from "@/lib/format";

interface ValueChangeProps {
  value: string;
  format?: "currency" | "percent";
  className?: string;
}

function getSign(value: string): "positive" | "negative" | "zero" {
  if (!value || value === "" || value === "0" || value === "0.00") {
    return "zero";
  }
  if (value.startsWith("-")) {
    return "negative";
  }
  // Check if it's actually zero (e.g., "0.000", "-0.00")
  const numeric = parseFloat(value);
  if (isNaN(numeric) || numeric === 0) {
    return "zero";
  }
  return numeric > 0 ? "positive" : "negative";
}

const signClasses: Record<ReturnType<typeof getSign>, string> = {
  positive: "text-accent-positive",
  negative: "text-accent-negative",
  zero: "text-text-secondary",
};

const signArrows: Record<ReturnType<typeof getSign>, string> = {
  positive: "\u25B2",
  negative: "\u25BC",
  zero: "",
};

export function ValueChange({
  value,
  format = "currency",
  className,
}: ValueChangeProps) {
  const sign = getSign(value);
  const formatted =
    format === "currency"
      ? formatCurrency(value, { showSign: sign === "positive" })
      : formatPercent(value, { showSign: sign === "positive" });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono tabular-nums",
        signClasses[sign],
        className,
      )}
    >
      {signArrows[sign] && (
        <span className="text-[0.65em]">{signArrows[sign]}</span>
      )}
      {formatted}
    </span>
  );
}
