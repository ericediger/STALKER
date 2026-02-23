"use client";

import { formatDate, formatQuantity } from "@/lib/format";

export interface SellValidationErrorData {
  error: "SELL_VALIDATION_FAILED";
  message: string;
  details: {
    instrumentSymbol: string;
    firstViolationDate: string; // ISO datetime
    deficitQuantity: string; // Decimal as string
  };
}

interface SellValidationErrorProps {
  error: SellValidationErrorData | null;
}

export function SellValidationError({ error }: SellValidationErrorProps) {
  if (!error) return null;

  const { instrumentSymbol, firstViolationDate, deficitQuantity } =
    error.details;
  const date = formatDate(firstViolationDate);
  const deficit = formatQuantity(deficitQuantity);

  return (
    <div className="bg-accent-negative/10 border border-accent-negative/30 rounded-lg p-4 space-y-2">
      <p className="text-accent-negative font-medium">
        This sell would create a negative position
      </p>
      <p className="text-text-secondary text-sm">
        Position for{" "}
        <span className="font-semibold text-text-primary">
          {instrumentSymbol}
        </span>{" "}
        would go negative on{" "}
        <span className="font-semibold text-text-primary">{date}</span> by{" "}
        <span className="font-mono font-semibold text-text-primary">
          {deficit}
        </span>{" "}
        shares.
      </p>
      <p className="text-text-tertiary text-sm">
        Reduce the sell quantity by at least {deficit} shares, or add a buy
        transaction before {date}.
      </p>
    </div>
  );
}
