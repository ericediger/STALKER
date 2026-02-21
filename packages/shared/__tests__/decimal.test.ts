import { describe, it, expect } from 'vitest';
import {
  Decimal,
  toDecimal,
  add,
  sub,
  mul,
  div,
  isNegative,
  isZero,
  formatCurrency,
  formatPercent,
  formatQuantity,
  gt,
  gte,
  lt,
  lte,
  eq,
  min,
  max,
  ZERO,
  ONE,
} from '../src/index.js';

describe('toDecimal', () => {
  it('should convert a string to Decimal', () => {
    const result = toDecimal('123.45');
    expect(result.toString()).toBe('123.45');
  });

  it('should convert a number to Decimal', () => {
    const result = toDecimal(42);
    expect(result.toString()).toBe('42');
  });

  it('should return the same Decimal if already a Decimal', () => {
    const d = new Decimal('99.99');
    const result = toDecimal(d);
    expect(result).toBe(d);
  });
});

describe('arithmetic operations', () => {
  it('add should sum two decimals', () => {
    const result = add(toDecimal('10.5'), toDecimal('20.3'));
    expect(result.toString()).toBe('30.8');
  });

  it('sub should subtract two decimals', () => {
    const result = sub(toDecimal('100'), toDecimal('30.5'));
    expect(result.toString()).toBe('69.5');
  });

  it('mul should multiply two decimals', () => {
    const result = mul(toDecimal('12.5'), toDecimal('4'));
    expect(result.toString()).toBe('50');
  });

  it('div should divide two decimals', () => {
    const result = div(toDecimal('100'), toDecimal('3'));
    // Decimal.js default precision is 20
    expect(result.toString()).toBe('33.333333333333333333');
  });

  it('should handle precise financial arithmetic without floating point errors', () => {
    // Classic floating point issue: 0.1 + 0.2 !== 0.3 in JS numbers
    const result = add(toDecimal('0.1'), toDecimal('0.2'));
    expect(result.toString()).toBe('0.3');
  });
});

describe('predicates', () => {
  it('isNegative should detect negative values', () => {
    expect(isNegative(toDecimal('-5'))).toBe(true);
    expect(isNegative(toDecimal('5'))).toBe(false);
    expect(isNegative(ZERO)).toBe(false);
  });

  it('isZero should detect zero', () => {
    expect(isZero(ZERO)).toBe(true);
    expect(isZero(toDecimal('0'))).toBe(true);
    expect(isZero(toDecimal('0.00'))).toBe(true);
    expect(isZero(toDecimal('1'))).toBe(false);
  });
});

describe('formatting', () => {
  it('formatCurrency should format with 2 decimal places by default', () => {
    expect(formatCurrency(toDecimal('1234.5'))).toBe('1234.50');
    expect(formatCurrency(toDecimal('99'))).toBe('99.00');
  });

  it('formatCurrency should support custom decimal places', () => {
    expect(formatCurrency(toDecimal('1234.5678'), 4)).toBe('1234.5678');
  });

  it('formatPercent should multiply by 100 and append %', () => {
    expect(formatPercent(toDecimal('0.1234'))).toBe('12.34%');
    expect(formatPercent(toDecimal('1'))).toBe('100.00%');
  });

  it('formatPercent should support custom decimal places', () => {
    expect(formatPercent(toDecimal('0.12345'), 3)).toBe('12.345%');
  });

  it('formatQuantity should remove trailing zeros', () => {
    expect(formatQuantity(toDecimal('100'))).toBe('100');
    expect(formatQuantity(toDecimal('100.50'))).toBe('100.5');
    expect(formatQuantity(toDecimal('0.001'))).toBe('0.001');
  });
});

describe('comparison helpers', () => {
  it('gt should return true if a > b', () => {
    expect(gt(toDecimal('10'), toDecimal('5'))).toBe(true);
    expect(gt(toDecimal('5'), toDecimal('10'))).toBe(false);
    expect(gt(toDecimal('5'), toDecimal('5'))).toBe(false);
  });

  it('gte should return true if a >= b', () => {
    expect(gte(toDecimal('10'), toDecimal('5'))).toBe(true);
    expect(gte(toDecimal('5'), toDecimal('5'))).toBe(true);
    expect(gte(toDecimal('4'), toDecimal('5'))).toBe(false);
  });

  it('lt should return true if a < b', () => {
    expect(lt(toDecimal('3'), toDecimal('5'))).toBe(true);
    expect(lt(toDecimal('5'), toDecimal('3'))).toBe(false);
  });

  it('lte should return true if a <= b', () => {
    expect(lte(toDecimal('5'), toDecimal('5'))).toBe(true);
    expect(lte(toDecimal('3'), toDecimal('5'))).toBe(true);
    expect(lte(toDecimal('6'), toDecimal('5'))).toBe(false);
  });

  it('eq should return true if a === b', () => {
    expect(eq(toDecimal('5'), toDecimal('5'))).toBe(true);
    expect(eq(toDecimal('5'), toDecimal('5.0'))).toBe(true);
    expect(eq(toDecimal('5'), toDecimal('6'))).toBe(false);
  });

  it('min should return the smaller value', () => {
    expect(min(toDecimal('3'), toDecimal('7')).toString()).toBe('3');
    expect(min(toDecimal('7'), toDecimal('3')).toString()).toBe('3');
  });

  it('max should return the larger value', () => {
    expect(max(toDecimal('3'), toDecimal('7')).toString()).toBe('7');
    expect(max(toDecimal('7'), toDecimal('3')).toString()).toBe('7');
  });
});

describe('constants', () => {
  it('ZERO should equal 0', () => {
    expect(ZERO.toString()).toBe('0');
  });

  it('ONE should equal 1', () => {
    expect(ONE.toString()).toBe('1');
  });
});
