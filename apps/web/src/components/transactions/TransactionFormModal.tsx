"use client";

import { useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { TransactionForm } from "./TransactionForm";
import type { InstrumentOption } from "@/lib/hooks/useInstruments";

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

interface TransactionFormModalProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  transaction?: ExistingTransaction;
  instruments: InstrumentOption[];
  onSuccess: () => void;
  /** When set, pre-selects the instrument and disables the dropdown. */
  defaultInstrumentId?: string;
}

export function TransactionFormModal({
  open,
  onClose,
  mode,
  transaction,
  instruments,
  onSuccess,
  defaultInstrumentId,
}: TransactionFormModalProps) {
  const { toast } = useToast();

  const handleSuccess = useCallback(() => {
    toast({
      message:
        mode === "create"
          ? "Transaction added successfully"
          : "Transaction updated successfully",
      variant: "success",
    });
    onClose();
    onSuccess();
  }, [mode, toast, onClose, onSuccess]);

  const handleError = useCallback(
    (message: string) => {
      toast({ message, variant: "error" });
    },
    [toast],
  );

  const title =
    mode === "create" ? "Add Transaction" : "Edit Transaction";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <TransactionForm
        mode={mode}
        transaction={transaction}
        instruments={instruments}
        onSuccess={handleSuccess}
        onError={handleError}
        defaultInstrumentId={defaultInstrumentId}
      />
    </Modal>
  );
}
