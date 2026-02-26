"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHoldingDetail } from "@/lib/hooks/useHoldingDetail";
import type { HoldingTransaction } from "@/lib/hooks/useHoldingDetail";
import { useInstruments } from "@/lib/hooks/useInstruments";
import { PositionSummary } from "@/components/holding-detail/PositionSummary";
import { CandlestickChart } from "@/components/holding-detail/CandlestickChart";
import { LotsTable } from "@/components/holding-detail/LotsTable";
import { HoldingTransactions } from "@/components/holding-detail/HoldingTransactions";
import { UnpricedWarning } from "@/components/holding-detail/UnpricedWarning";
import { TransactionFormModal } from "@/components/transactions/TransactionFormModal";
import { DeleteConfirmation } from "@/components/transactions/DeleteConfirmation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

export default function HoldingDetailPage() {
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol ?? "");

  const { data, isLoading, error, refetch } = useHoldingDetail(symbol);
  const { data: instruments } = useInstruments();

  const [editTx, setEditTx] = useState<HoldingTransaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<HoldingTransaction | null>(null);
  const [showDeleteInstrument, setShowDeleteInstrument] = useState(false);
  const [isDeletingInstrument, setIsDeletingInstrument] = useState(false);
  const { toast } = useToast();

  const handleEditSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDeleteSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDeleteInstrument = useCallback(async () => {
    if (!data) return;
    setIsDeletingInstrument(true);
    try {
      const res = await fetch(`/api/instruments/${data.instrumentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      toast({ message: `${data.symbol} deleted.`, variant: "success" });
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      toast({ message, variant: "error" });
    } finally {
      setIsDeletingInstrument(false);
      setShowDeleteInstrument(false);
    }
  }, [data, toast, router]);

  // Redirect to dashboard on 404
  useEffect(() => {
    if (error && error.message.includes("404")) {
      router.push("/");
    }
  }, [error, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-section">
        <Skeleton height="2rem" width="200px" />
        <Skeleton height="140px" />
        <Skeleton height="340px" />
        <Skeleton height="200px" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-section text-accent-negative">
        Failed to load holding: {error.message}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const hasPrice = data.markPrice != null && data.markPrice !== "";

  return (
    <div className="flex flex-col gap-6 p-section">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Back to portfolio"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-heading text-text-primary">
            {data.symbol}
          </h1>
          <p className="text-sm text-text-secondary">{data.name}</p>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowDeleteInstrument(true)}
        >
          Delete
        </Button>
      </div>

      {/* Unpriced warning */}
      {!hasPrice && <UnpricedWarning symbol={data.symbol} />}

      {/* Position summary */}
      <PositionSummary detail={data} />

      {/* Price chart */}
      <CandlestickChart symbol={data.symbol} transactions={data.transactions} />

      {/* FIFO Lots */}
      <LotsTable lots={data.lots} markPrice={hasPrice ? data.markPrice : null} />

      {/* Transactions */}
      <HoldingTransactions
        transactions={data.transactions}
        onEdit={setEditTx}
        onDelete={setDeleteTx}
      />

      {/* Edit Transaction Modal */}
      {editTx && (
        <TransactionFormModal
          open={!!editTx}
          onClose={() => setEditTx(null)}
          mode="edit"
          transaction={{
            id: editTx.id,
            instrumentId: data.instrumentId,
            type: editTx.type,
            quantity: editTx.quantity,
            price: editTx.price,
            fees: editTx.fees,
            tradeAt: editTx.tradeAt,
            notes: editTx.notes,
          }}
          instruments={instruments ?? []}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete Transaction Confirmation Modal */}
      <DeleteConfirmation
        open={!!deleteTx}
        onClose={() => setDeleteTx(null)}
        transaction={
          deleteTx
            ? {
                id: deleteTx.id,
                type: deleteTx.type,
                quantity: deleteTx.quantity,
                symbol: data.symbol,
                tradeAt: deleteTx.tradeAt,
              }
            : null
        }
        onSuccess={handleDeleteSuccess}
      />

      {/* Delete Instrument Modal */}
      <Modal
        open={showDeleteInstrument}
        onClose={() => setShowDeleteInstrument(false)}
        title={`Delete ${data.symbol}?`}
      >
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            This will permanently delete <strong className="text-text-primary">{data.name}</strong> and
            all {data.transactions.length} transaction{data.transactions.length !== 1 ? "s" : ""} associated
            with it. Portfolio snapshots will be rebuilt.
          </p>
          <p className="text-accent-negative text-sm font-medium">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteInstrument(false)}
              disabled={isDeletingInstrument}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteInstrument}
              loading={isDeletingInstrument}
            >
              Delete Instrument
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
