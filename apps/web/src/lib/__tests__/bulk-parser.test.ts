import { describe, it, expect } from 'vitest';
import { parseBulkInput, type ParsedRow } from '../bulk-parser';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function validRow(overrides: Partial<ParsedRow['parsed']> = {}): NonNullable<ParsedRow['parsed']> {
  return {
    symbol: 'VTI',
    type: 'BUY',
    quantity: '50',
    price: '220.00',
    date: '2025-06-15',
    fees: '0',
    notes: '',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe('parseBulkInput', () => {
  it('parses 3 valid tab-separated rows correctly', () => {
    const input = [
      'VTI\tBUY\t50\t220.00\t2025-06-15',
      'QQQ\tBUY\t30\t465.00\t2025-07-01',
      'VTI\tSELL\t20\t235.50\t2025-11-20\t4.95\tRebalance',
    ].join('\n');

    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(3);

    // Row 1
    expect(rows[0]!.lineNumber).toBe(1);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed).toEqual(validRow());

    // Row 2
    expect(rows[1]!.lineNumber).toBe(2);
    expect(rows[1]!.errors).toEqual([]);
    expect(rows[1]!.parsed).toEqual(validRow({
      symbol: 'QQQ',
      quantity: '30',
      price: '465.00',
      date: '2025-07-01',
    }));

    // Row 3
    expect(rows[2]!.lineNumber).toBe(3);
    expect(rows[2]!.errors).toEqual([]);
    expect(rows[2]!.parsed).toEqual(validRow({
      type: 'SELL',
      quantity: '20',
      price: '235.50',
      date: '2025-11-20',
      fees: '4.95',
      notes: 'Rebalance',
    }));
  });

  it('returns error for a row with only 3 fields (missing required fields)', () => {
    const input = 'VTI\tBUY\t50';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors).toHaveLength(1);
    expect(rows[0]!.errors[0]).toContain('Expected at least 5 fields');
  });

  it('returns error for invalid date format (MM-DD-YYYY)', () => {
    const input = 'VTI\tBUY\t50\t220.00\t02-15-2025';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid date'))).toBe(true);
  });

  it('returns error for invalid date value (2025-13-45)', () => {
    const input = 'VTI\tBUY\t50\t220.00\t2025-13-45';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid date'))).toBe(true);
  });

  it('returns error for non-numeric quantity', () => {
    const input = 'VTI\tBUY\tabc\t220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid quantity'))).toBe(true);
  });

  it('handles BUY/SELL case insensitively', () => {
    const input = [
      'VTI\tbuy\t50\t220.00\t2025-06-15',
      'QQQ\tBuy\t30\t465.00\t2025-07-01',
      'AAPL\tBUY\t10\t180.00\t2025-08-01',
      'MSFT\tsell\t5\t350.00\t2025-09-01',
    ].join('\n');

    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(4);
    expect(rows[0]!.parsed!.type).toBe('BUY');
    expect(rows[1]!.parsed!.type).toBe('BUY');
    expect(rows[2]!.parsed!.type).toBe('BUY');
    expect(rows[3]!.parsed!.type).toBe('SELL');
    rows.forEach((r) => expect(r.errors).toEqual([]));
  });

  it('strips extra whitespace from fields', () => {
    const input = '  VTI \t BUY \t 50 \t 220.00 \t 2025-06-15 ';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed!.symbol).toBe('VTI');
    expect(rows[0]!.parsed!.quantity).toBe('50');
    expect(rows[0]!.parsed!.price).toBe('220.00');
    expect(rows[0]!.parsed!.date).toBe('2025-06-15');
  });

  it('parses optional fees and notes when 7 fields are present', () => {
    const input = 'VTI\tSELL\t20\t235.50\t2025-11-20\t4.95\tRebalance partial position';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed!.fees).toBe('4.95');
    expect(rows[0]!.parsed!.notes).toBe('Rebalance partial position');
  });

  it('skips empty lines between rows', () => {
    const input = [
      'VTI\tBUY\t50\t220.00\t2025-06-15',
      '',
      '',
      'QQQ\tBUY\t30\t465.00\t2025-07-01',
      '',
    ].join('\n');

    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.lineNumber).toBe(1);
    expect(rows[1]!.lineNumber).toBe(4);
  });

  it('returns error for negative quantity', () => {
    const input = 'VTI\tBUY\t-50\t220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid quantity') || e.includes('positive'))).toBe(true);
  });

  it('returns error for negative price', () => {
    const input = 'VTI\tBUY\t50\t-220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid price') || e.includes('positive'))).toBe(true);
  });

  it('returns error for invalid type', () => {
    const input = 'VTI\tHOLD\t50\t220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Type must be BUY or SELL'))).toBe(true);
  });

  it('normalizes Windows line endings (\\r\\n)', () => {
    const input = 'VTI\tBUY\t50\t220.00\t2025-06-15\r\nQQQ\tBUY\t30\t465.00\t2025-07-01\r\n';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors).toEqual([]);
    expect(rows[0]!.parsed!.symbol).toBe('VTI');
    expect(rows[1]!.parsed!.symbol).toBe('QQQ');
  });

  it('handles multi-space separation as fallback', () => {
    const input = 'VTI  BUY  50  220.00  2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed!.symbol).toBe('VTI');
    expect(rows[0]!.parsed!.type).toBe('BUY');
  });

  it('uppercases symbol', () => {
    const input = 'vti\tBUY\t50\t220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed!.symbol).toBe('VTI');
  });

  it('returns error for invalid fees', () => {
    const input = 'VTI\tBUY\t50\t220.00\t2025-06-15\txyz';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid fees'))).toBe(true);
  });

  it('defaults fees to "0" when not provided', () => {
    const input = 'VTI\tBUY\t50\t220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed!.fees).toBe('0');
  });

  it('handles zero quantity as invalid', () => {
    const input = 'VTI\tBUY\t0\t220.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.parsed).toBeNull();
    expect(rows[0]!.errors.some((e) => e.includes('Invalid quantity') || e.includes('positive'))).toBe(true);
  });

  it('handles mixed valid and invalid rows', () => {
    const input = [
      'VTI\tBUY\t50\t220.00\t2025-06-15',
      'BAD\tHOLD\t-1\txyz\t99-99-99',
      'QQQ\tSELL\t10\t480.00\t2025-12-01',
    ].join('\n');

    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(3);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed).not.toBeNull();
    expect(rows[1]!.errors.length).toBeGreaterThan(0);
    expect(rows[1]!.parsed).toBeNull();
    expect(rows[2]!.errors).toEqual([]);
    expect(rows[2]!.parsed).not.toBeNull();
  });

  it('preserves raw line text', () => {
    const raw = 'VTI\tBUY\t50\t220.00\t2025-06-15';
    const rows = parseBulkInput(raw);

    expect(rows[0]!.raw).toBe(raw);
  });

  it('returns empty array for empty input', () => {
    expect(parseBulkInput('')).toEqual([]);
    expect(parseBulkInput('  \n  \n  ')).toEqual([]);
  });

  it('handles fractional quantities (e.g., 0.5 shares)', () => {
    const input = 'BTC\tBUY\t0.5\t42000.00\t2025-06-15';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed!.quantity).toBe('0.5');
  });

  it('collects multiple errors for a single row', () => {
    const input = 'VTI\tFOO\tabc\t-5\t2025-13-45';
    const rows = parseBulkInput(input);

    expect(rows).toHaveLength(1);
    // Should have errors for type, quantity, price, date
    expect(rows[0]!.errors.length).toBeGreaterThanOrEqual(3);
  });
});
