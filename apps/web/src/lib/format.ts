import { toDecimal, Decimal } from '@stalker/shared';

const EM_DASH = '\u2014';

/**
 * Try to parse a string into a Decimal. Returns null if the value
 * is empty, undefined-like, NaN, or otherwise unparseable.
 */
function safeParse(value: string): Decimal | null {
  if (value === '' || value === 'NaN' || value === 'undefined' || value === 'null') {
    return null;
  }
  try {
    return toDecimal(value);
  } catch {
    return null;
  }
}

/**
 * Add thousands separators to the integer part of a numeric string.
 */
function addThousandsSeparators(integerPart: string): string {
  // Handle negative sign
  const isNeg = integerPart.startsWith('-');
  const digits = isNeg ? integerPart.slice(1) : integerPart;
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return isNeg ? '-' + withCommas : withCommas;
}

/**
 * Format a Decimal value as currency string with sign handling.
 * Negative: -$1,234.56 (minus before dollar sign)
 */
function formatCurrencyFromDecimal(
  d: Decimal,
  opts?: { showSign?: boolean },
): string {
  // Normalize negative zero
  const val = d.isZero() ? d.abs() : d;
  const isNeg = val.isNegative();
  const abs = val.abs();
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formatted = addThousandsSeparators(intPart) + '.' + decPart;

  if (isNeg) {
    return '-$' + formatted;
  }
  if (opts?.showSign) {
    return '+$' + formatted;
  }
  return '$' + formatted;
}

/**
 * Format a string Decimal value as US dollar currency.
 *
 * - `"12345.67"` -> `"$12,345.67"`
 * - `"-567.89"` with showSign -> `"-$567.89"`
 * - `"567.89"` with showSign -> `"+$567.89"`
 * - Zero -> `"$0.00"` (never `-$0.00`)
 * - Invalid -> em dash
 */
export function formatCurrency(
  value: string,
  opts?: { showSign?: boolean },
): string {
  const d = safeParse(value);
  if (d === null) return EM_DASH;
  return formatCurrencyFromDecimal(d, opts);
}

/**
 * Format a string Decimal value as a percentage.
 *
 * - `"5.678"` -> `"5.68%"` (default 2 decimals)
 * - `"-3.45"` with showSign -> `"-3.45%"`
 * - `"3.45"` with showSign -> `"+3.45%"`
 * - Zero -> `"0.00%"` (never `-0.00%`)
 * - Invalid -> em dash
 */
export function formatPercent(
  value: string,
  opts?: { showSign?: boolean; decimals?: number },
): string {
  const d = safeParse(value);
  if (d === null) return EM_DASH;

  const decimals = opts?.decimals ?? 2;
  // Normalize negative zero
  const val = d.isZero() ? d.abs() : d;
  const isNeg = val.isNegative();
  const fixed = val.abs().toFixed(decimals);

  if (isNeg) {
    return '-' + fixed + '%';
  }
  if (opts?.showSign) {
    return '+' + fixed + '%';
  }
  return fixed + '%';
}

/**
 * Format a string Decimal value as a quantity with thousands separators.
 * Preserves fractional precision as-is.
 *
 * - `"1234"` -> `"1,234"`
 * - `"0.5000"` -> `"0.5000"` (preserve fractional precision)
 * - Invalid -> em dash
 */
export function formatQuantity(value: string): string {
  const d = safeParse(value);
  if (d === null) return EM_DASH;

  // Use the original string to preserve trailing zeros in the decimal part.
  // Decimal.toFixed() without args strips trailing zeros, which is not what we want.
  // We need to figure out the number of decimal places from the original value.
  const normalized = d.isZero() ? d.abs() : d;
  const str = normalized.toString();

  // Determine the decimal places from the original input string to preserve precision.
  // If the original value has a decimal point, count the digits after it.
  const originalDotIndex = value.indexOf('.');
  let decimalPlaces = 0;
  if (originalDotIndex !== -1) {
    decimalPlaces = value.length - originalDotIndex - 1;
  }

  if (decimalPlaces > 0) {
    const fixed = normalized.toFixed(decimalPlaces);
    const [intPart, decPart] = fixed.split('.');
    return addThousandsSeparators(intPart) + '.' + decPart;
  }

  // Integer — just add separators
  const intStr = str.includes('.') ? str.split('.')[0] : str;
  return addThousandsSeparators(intStr);
}

/**
 * Format a string Decimal value in compact notation with $ prefix.
 *
 * - `"1234567.89"` -> `"$1.2M"`
 * - `"12345.67"` -> `"$12.3K"`
 * - `"999"` -> `"$999"`
 * - `"-1234567"` -> `"-$1.2M"`
 * - Invalid -> em dash
 */
export function formatCompact(value: string): string {
  const d = safeParse(value);
  if (d === null) return EM_DASH;

  const val = d.isZero() ? d.abs() : d;
  const isNeg = val.isNegative();
  const abs = val.abs();
  const prefix = isNeg ? '-$' : '$';

  if (abs.gte(1_000_000_000)) {
    const billions = abs.div(1_000_000_000);
    return prefix + billions.toFixed(1) + 'B';
  }
  if (abs.gte(1_000_000)) {
    const millions = abs.div(1_000_000);
    return prefix + millions.toFixed(1) + 'M';
  }
  if (abs.gte(1_000)) {
    const thousands = abs.div(1_000);
    return prefix + thousands.toFixed(1) + 'K';
  }

  // Below 1000 — show as plain currency without decimals
  return prefix + abs.toFixed(0);
}

/**
 * Format an ISO date string to a human-readable date.
 *
 * - `"2026-02-18T16:00:00Z"` -> `"Feb 18, 2026"`
 * - `"2026-02-18"` -> `"Feb 18, 2026"`
 * - Invalid -> em dash
 */
export function formatDate(isoString: string): string {
  if (!isoString || typeof isoString !== 'string') return EM_DASH;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return EM_DASH;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return EM_DASH;
  }
}

/**
 * Format an ISO date string as relative time from now.
 *
 * - Recent -> `"5 min ago"`, `"2 hr ago"`, `"3 days ago"`
 * - Invalid -> em dash
 */
export function formatRelativeTime(isoString: string): string {
  if (!isoString || typeof isoString !== 'string') return EM_DASH;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return EM_DASH;

    const now = Date.now();
    const diffMs = now - date.getTime();

    // Future dates
    if (diffMs < 0) return EM_DASH;

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSec < 60) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr === 1) return '1 hr ago';
    if (diffHr < 24) return `${diffHr} hr ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffWeeks === 1) return '1 week ago';
    if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
    if (diffMonths === 1) return '1 month ago';
    if (diffMonths < 12) return `${diffMonths} months ago`;
    if (diffYears === 1) return '1 year ago';
    return `${diffYears} years ago`;
  } catch {
    return EM_DASH;
  }
}
