"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  SellValidationError,
  type SellValidationErrorData,
} from "./SellValidationError";
import { formatDate, formatQuantity } from "@/lib/format";

interface DeleteConfirmationProps {
  open: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    type: "BUY" | "SELL";
    quantity: string;
    symbol: string;
    tradeAt: string;
  } | null;
  onSuccess: () => void;
}

export function DeleteConfirmation({
  open,
  onClose,
  transaction,
  onSuccess,
}: DeleteConfirmationProps) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [sellError, setSellError] =
    useState<SellValidationErrorData | null>(null);

  const handleDelete = useCallback(async () => {
    if (!transaction) return;

    setDeleting(true);
    setSellError(null);

    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE",
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

      toast({ message: "Transaction deleted", variant: "success" });
      onClose();
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete transaction";
      toast({ message, variant: "error" });
    } finally {
      setDeleting(false);
    }
  }, [transaction, toast, onClose, onSuccess]);

  const handleClose = useCallback(() => {
    setSellError(null);
    onClose();
  }, [onClose]);

  if (!transaction) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Delete Transaction">
      <div className="space-y-4">
        <p id="delete-confirm-desc" className="text-text-secondary">
          Delete this{" "}
          <span className="font-medium text-text-primary">
            {transaction.type}
          </span>{" "}
          transaction for{" "}
          <span className="font-mono font-medium text-text-primary">
            {formatQuantity(transaction.quantity)}
          </span>{" "}
          shares of{" "}
          <span className="font-medium text-text-primary">
            {transaction.symbol}
          </span>{" "}
          on{" "}
          <span className="font-medium text-text-primary">
            {formatDate(transaction.tradeAt)}
          </span>
          ?
        </p>

        <SellValidationError error={sellError} />

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={deleting}
            disabled={deleting}
          >
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
