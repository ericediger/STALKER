export function TransactionsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <p className="text-text-secondary text-lg text-center">
        No transactions yet. Add an instrument first, then record your trades.
      </p>
    </div>
  );
}
