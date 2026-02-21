import type { Decimal } from 'decimal.js';

// === Enums ===
export const TransactionType = { BUY: 'BUY', SELL: 'SELL' } as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const InstrumentType = { STOCK: 'STOCK', ETF: 'ETF', FUND: 'FUND' } as const;
export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];

export const Resolution = { DAY: '1D' } as const;
export type Resolution = (typeof Resolution)[keyof typeof Resolution];

// === Source of Truth Entities ===
export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  type: InstrumentType;
  currency: string;
  exchange: string;
  exchangeTz: string;
  providerSymbolMap: Record<string, string>;
  firstBarDate: string | null; // YYYY-MM-DD
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  instrumentId: string;
  type: TransactionType;
  quantity: Decimal;
  price: Decimal;
  fees: Decimal;
  tradeAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceBar {
  id: number;
  instrumentId: string;
  provider: string;
  resolution: Resolution;
  date: string; // YYYY-MM-DD
  time: Date | null;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: number | null;
}

// === Materialized Caches ===
export interface LatestQuote {
  id: number;
  instrumentId: string;
  provider: string;
  price: Decimal;
  asOf: Date;
  fetchedAt: Date;
  rebuiltAt: Date;
}

export interface HoldingSnapshot {
  qty: Decimal;
  value: Decimal;
  costBasis: Decimal;
}

export interface PortfolioValueSnapshot {
  id: number;
  date: string; // YYYY-MM-DD
  totalValue: Decimal;
  totalCostBasis: Decimal;
  realizedPnl: Decimal;
  unrealizedPnl: Decimal;
  holdingsJson: Record<string, HoldingSnapshot>;
  rebuiltAt: Date;
}

// === Analytics Types ===
export interface Lot {
  instrumentId: string;
  openedAt: Date;
  originalQty: Decimal;
  remainingQty: Decimal;
  price: Decimal;
  costBasisRemaining: Decimal;
}

export interface RealizedTrade {
  instrumentId: string;
  sellDate: Date;
  qty: Decimal;
  proceeds: Decimal;
  costBasis: Decimal;
  realizedPnl: Decimal;
  fees: Decimal;
}

export interface UnrealizedPnL {
  totalUnrealized: Decimal;
  perLot: Array<{
    lot: Lot;
    unrealizedPnl: Decimal;
    markPrice: Decimal;
  }>;
}

export interface HoldingSummary {
  instrumentId: string;
  symbol: string;
  totalQty: Decimal;
  totalCostBasis: Decimal;
  marketValue: Decimal;
  unrealizedPnl: Decimal;
  unrealizedPnlPercent: Decimal;
  realizedPnl: Decimal;
  lots: Lot[];
  realizedTrades: RealizedTrade[];
}

export interface PortfolioSummary {
  totalValue: Decimal;
  totalCostBasis: Decimal;
  totalUnrealizedPnl: Decimal;
  totalRealizedPnl: Decimal;
  holdings: HoldingSummary[];
}

// === Market Data Types ===
export interface Quote {
  symbol: string;
  price: Decimal;
  asOf: Date;
  provider: string;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  providerSymbol: string;
}

export interface ProviderLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  supportsIntraday: boolean;
  quoteDelayMinutes: number;
}

export interface MarketDataProvider {
  readonly name: string;
  searchSymbols(query: string): Promise<SymbolSearchResult[]>;
  getQuote(symbol: string): Promise<Quote>;
  getHistory(symbol: string, start: Date, end: Date, resolution: Resolution): Promise<PriceBar[]>;
  getLimits(): ProviderLimits;
}

// === Validation Types ===
export interface ValidationSuccess {
  valid: true;
}

export interface ValidationFailure {
  valid: false;
  offendingTransaction: Transaction;
  firstNegativeDate: Date;
  deficitQty: Decimal;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;
