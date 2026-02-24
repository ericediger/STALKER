interface UnpricedWarningProps {
  symbol: string;
}

export function UnpricedWarning({ symbol }: UnpricedWarningProps) {
  return (
    <div role="alert" className="bg-accent-warning/10 border border-accent-warning/30 text-accent-warning rounded-lg p-4">
      <p className="text-sm font-medium">
        No price data available for {symbol}. Market value and PnL cannot be
        calculated.
      </p>
    </div>
  );
}
