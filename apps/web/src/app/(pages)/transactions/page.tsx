"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { TransactionFormModal } from "@/components/transactions/TransactionFormModal";
import { DeleteConfirmation } from "@/components/transactions/DeleteConfirmation";
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";
import { useTransactions } from "@/lib/hooks/useTransactions";
import { useInstruments } from "@/lib/hooks/useInstruments";
import type { TransactionRow } from "@/lib/transaction-utils";

export default function TransactionsPage() {
  const { data: transactions, isLoading, refetch } = useTransactions();
  const { data: instruments, refetch: refetchInstruments } = useInstruments();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editTx, setEditTx] = useState<TransactionRow | null>(null);
  const [deleteTx, setDeleteTx] = useState<TransactionRow | null>(null);
  const [showAddInstrument, setShowAddInstrument] = useState(false);

  const handleAddSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleEditSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDeleteSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleInstrumentSuccess = useCallback(() => {
    refetchInstruments();
  }, [refetchInstruments]);

  const hasTransactions = transactions && transactions.length > 0;
  const hasInstruments = instruments && instruments.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-text-primary font-semibold">
          Transactions
        </h1>
        <div className="flex items-center gap-3">
          {hasInstruments && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              + Add Transaction
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
        </div>
      ) : hasTransactions ? (
        <TransactionsTable
          transactions={transactions}
          onEdit={setEditTx}
          onDelete={setDeleteTx}
        />
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p className="text-text-secondary text-lg text-center">
            No transactions yet. Add your first transaction to start tracking
            your portfolio.
          </p>
          {hasInstruments ? (
            <Button
              variant="primary"
              onClick={() => setShowAddForm(true)}
            >
              + Add Transaction
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => setShowAddInstrument(true)}
            >
              + Add Instrument
            </Button>
          )}
        </div>
      )}

      {/* Add Transaction Modal */}
      <TransactionFormModal
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        mode="create"
        instruments={instruments ?? []}
        onSuccess={handleAddSuccess}
      />

      {/* Edit Transaction Modal */}
      {editTx && (
        <TransactionFormModal
          open={!!editTx}
          onClose={() => setEditTx(null)}
          mode="edit"
          transaction={{
            id: editTx.id,
            instrumentId: editTx.instrumentId,
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

      {/* Delete Confirmation Modal */}
      <DeleteConfirmation
        open={!!deleteTx}
        onClose={() => setDeleteTx(null)}
        transaction={
          deleteTx
            ? {
                id: deleteTx.id,
                type: deleteTx.type,
                quantity: deleteTx.quantity,
                symbol: deleteTx.symbol,
                tradeAt: deleteTx.tradeAt,
              }
            : null
        }
        onSuccess={handleDeleteSuccess}
      />

      {/* Add Instrument Modal */}
      <AddInstrumentModal
        open={showAddInstrument}
        onClose={() => setShowAddInstrument(false)}
        onSuccess={handleInstrumentSuccess}
      />
    </div>
  );
}
