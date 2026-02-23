"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  SellValidationError,
  type SellValidationErrorData,
} from "./SellValidationError";
import {
  validateTransactionForm,
  formatTransactionForApi,
  type TransactionFormFields,
  type TransactionFormErrors,
} from "@/lib/transaction-utils";
import type { InstrumentOption } from "@/lib/hooks/useInstruments";
import { cn } from "@/lib/cn";

interface ExistingTransaction {
  id: string;
  instrumentId: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  fees: string;
  tradeAt: string;
  notes: string | null;
}

interface TransactionFormProps {
  mode: "create" | "edit";
  transaction?: ExistingTransaction;
  instruments: InstrumentOption[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

function getDateFromIso(isoString: string): string {
  // Extract YYYY-MM-DD from ISO string
  return isoString.split("T")[0] ?? "";
}

function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function TransactionForm({
  mode,
  transaction,
  instruments,
  onSuccess,
  onError,
}: TransactionFormProps) {
  const [fields, setFields] = useState<TransactionFormFields>({
    instrumentId: transaction?.instrumentId ?? "",
    type: transaction?.type ?? "BUY",
    quantity: transaction?.quantity ?? "",
    price: transaction?.price ?? "",
    tradeAt: transaction
      ? getDateFromIso(transaction.tradeAt)
      : todayDateString(),
    fees: transaction?.fees ?? "",
    notes: transaction?.notes ?? "",
  });

  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [sellError, setSellError] =
    useState<SellValidationErrorData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateField = useCallback(
    (field: keyof TransactionFormFields, value: string) => {
      setFields((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof TransactionFormErrors];
        return next;
      });
      setSellError(null);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const validation = validateTransactionForm(fields);
      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }

      setSubmitting(true);
      setSellError(null);

      try {
        const body = formatTransactionForApi(fields);
        const url =
          mode === "create"
            ? "/api/transactions"
            : `/api/transactions/${transaction?.id}`;
        const method = mode === "create" ? "POST" : "PUT";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 422) {
          const data = (await res.json()) as SellValidationErrorData;
          setSellError(data);
          return;
        }

        if (!res.ok) {
          const data = (await res.json()) as { message?: string };
          throw new Error(data.message ?? `HTTP ${res.status}`);
        }

        onSuccess();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to save transaction";
        onError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [fields, mode, transaction?.id, onSuccess, onError],
  );

  const instrumentOptions = instruments.map((inst) => ({
    label: `${inst.symbol} — ${inst.name}`,
    value: inst.id,
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        label="Instrument"
        options={instrumentOptions}
        placeholder="Select instrument..."
        value={fields.instrumentId}
        onChange={(v) => updateField("instrumentId", v)}
        error={errors.instrumentId}
      />

      {/* Type toggle */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Type</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateField("type", "BUY")}
            className={cn(
              "flex-1 py-2 rounded-md font-medium text-sm transition-colors",
              fields.type === "BUY"
                ? "bg-accent-positive/20 text-accent-positive border border-accent-positive/30"
                : "bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary",
            )}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => updateField("type", "SELL")}
            className={cn(
              "flex-1 py-2 rounded-md font-medium text-sm transition-colors",
              fields.type === "SELL"
                ? "bg-accent-negative/20 text-accent-negative border border-accent-negative/30"
                : "bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary",
            )}
          >
            SELL
          </button>
        </div>
        {errors.type && (
          <p className="text-sm text-accent-negative">{errors.type}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Shares"
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={fields.quantity}
          onChange={(e) => updateField("quantity", e.target.value)}
          error={errors.quantity}
        />
        <Input
          label="Price per share"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={fields.price}
          onChange={(e) => updateField("price", e.target.value)}
          error={errors.price}
        />
      </div>

      <Input
        label="Trade Date"
        type="date"
        value={fields.tradeAt}
        onChange={(e) => updateField("tradeAt", e.target.value)}
        error={errors.tradeAt}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Fees"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={fields.fees}
          onChange={(e) => updateField("fees", e.target.value)}
          error={errors.fees}
        />
        <Input
          label="Notes"
          type="text"
          placeholder="Optional"
          value={fields.notes}
          onChange={(e) => updateField("notes", e.target.value)}
        />
      </div>

      <SellValidationError error={sellError} />

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={submitting}
        disabled={submitting}
      >
        {mode === "create" ? "Add Transaction" : "Save Changes"}
      </Button>
    </form>
  );
}
