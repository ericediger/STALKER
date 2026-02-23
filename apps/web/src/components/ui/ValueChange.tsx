import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent } from "@/lib/format";
import { toDecimal } from "@stalker/shared";

interface ValueChangeProps {
  value: string;
  format?: "currency" | "percent";
  className?: string;
}

function getSign(value: string): "positive" | "negative" | "zero" {
  if (!value || value === "") {
    return "zero";
  }
  try {
    const d = toDecimal(value);
    if (d.isZero()) return "zero";
    return d.isPositive() ? "positive" : "negative";
  } catch {
    return "zero";
  }
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
