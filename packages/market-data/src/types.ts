// Re-export market data types from shared
export type {
  MarketDataProvider,
  Quote,
  SymbolSearchResult,
  ProviderLimits,
  PriceBar,
  Instrument,
  Resolution,
} from '@stalker/shared';

// === Provider Error Classification ===
export type ProviderErrorType =
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN';

export class ProviderError extends Error {
  readonly type: ProviderErrorType;
  readonly provider: string;

  constructor(message: string, type: ProviderErrorType, provider: string) {
    super(message);
    this.name = 'ProviderError';
    this.type = type;
    this.provider = provider;
  }
}

export class NotSupportedError extends Error {
  readonly provider: string;
  readonly operation: string;

  constructor(provider: string, operation: string) {
    super(`${provider} does not support ${operation}`);
    this.name = 'NotSupportedError';
    this.provider = provider;
    this.operation = operation;
  }
}
