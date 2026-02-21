import Decimal from 'decimal.js';

export { Decimal };

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export function toDecimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

export function add(a: Decimal, b: Decimal): Decimal {
  return a.plus(b);
}

export function sub(a: Decimal, b: Decimal): Decimal {
  return a.minus(b);
}

export function mul(a: Decimal, b: Decimal): Decimal {
  return a.times(b);
}

export function div(a: Decimal, b: Decimal): Decimal {
  return a.dividedBy(b);
}

export function isNegative(d: Decimal): boolean {
  return d.isNegative();
}

export function isZero(d: Decimal): boolean {
  return d.isZero();
}

export function formatCurrency(d: Decimal, decimals: number = 2): string {
  return d.toFixed(decimals);
}

export function formatPercent(d: Decimal, decimals: number = 2): string {
  return d.times(100).toFixed(decimals) + '%';
}

export function formatQuantity(d: Decimal): string {
  // Remove trailing zeros but keep at least integer part
  return d.toFixed();
}

// Comparison helpers
export function gt(a: Decimal, b: Decimal): boolean {
  return a.greaterThan(b);
}

export function gte(a: Decimal, b: Decimal): boolean {
  return a.greaterThanOrEqualTo(b);
}

export function lt(a: Decimal, b: Decimal): boolean {
  return a.lessThan(b);
}

export function lte(a: Decimal, b: Decimal): boolean {
  return a.lessThanOrEqualTo(b);
}

export function eq(a: Decimal, b: Decimal): boolean {
  return a.equals(b);
}

export function min(a: Decimal, b: Decimal): Decimal {
  return Decimal.min(a, b);
}

export function max(a: Decimal, b: Decimal): Decimal {
  return Decimal.max(a, b);
}
