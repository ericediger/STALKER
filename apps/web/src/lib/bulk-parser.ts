import { toDecimal } from '@stalker/shared';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ParsedRowData {
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: string; // Decimal string
  price: string; // Decimal string
  date: string; // YYYY-MM-DD
  fees: string; // Decimal string, default "0"
  notes: string;
}

export interface ParsedRow {
  lineNumber: number;
  raw: string;
  parsed: ParsedRowData | null;
  errors: string[];
}

/* -------------------------------------------------------------------------- */
/*  Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const parts = dateStr.split('-');
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);
  const day = parseInt(parts[2]!, 10);

  // Check basic ranges
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Use Date to validate actual day-in-month
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

function isPositiveDecimal(value: string): boolean {
  try {
    const d = toDecimal(value);
    return d.isPositive() && !d.isZero();
  } catch {
    return false;
  }
}

function isNonNegativeDecimal(value: string): boolean {
  try {
    const d = toDecimal(value);
    return !d.isNegative();
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Parser                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse tab-separated (or multi-space-separated) text into structured rows.
 *
 * Expected column order:
 *   symbol  type  quantity  price  date  [fees]  [notes]
 *
 * Normalizes \r\n to \n before splitting for Windows clipboard compatibility.
 */
export function parseBulkInput(input: string): ParsedRow[] {
  // Normalize line endings
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const results: ParsedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();

    // Skip empty lines
    if (trimmed === '') continue;

    const lineNumber = i + 1;
    const errors: string[] = [];

    // Split by tab first. If only one field, try splitting by 2+ consecutive spaces.
    let fields = trimmed.split('\t');
    if (fields.length < 2) {
      fields = trimmed.split(/\s{2,}/);
    }

    // Trim each field
    fields = fields.map((f) => f.trim());

    // Need at least 5 fields: symbol, type, quantity, price, date
    if (fields.length < 5) {
      results.push({
        lineNumber,
        raw,
        parsed: null,
        errors: [`Expected at least 5 fields (symbol, type, quantity, price, date), got ${fields.length}`],
      });
      continue;
    }

    const symbolRaw = fields[0]!;
    const typeRaw = fields[1]!;
    const quantityRaw = fields[2]!;
    const priceRaw = fields[3]!;
    const dateRaw = fields[4]!;
    const feesRaw = fields[5] ?? '';
    const notesRaw = fields.slice(6).join(' ').trim();

    // Validate symbol
    const symbol = symbolRaw.toUpperCase();
    if (!symbol) {
      errors.push('Symbol is required');
    }

    // Validate type
    const typeUpper = typeRaw.toUpperCase();
    if (typeUpper !== 'BUY' && typeUpper !== 'SELL') {
      errors.push(`Type must be BUY or SELL, got "${typeRaw}"`);
    }

    // Validate quantity
    if (!quantityRaw) {
      errors.push('Quantity is required');
    } else if (!isPositiveDecimal(quantityRaw)) {
      errors.push(`Invalid quantity: "${quantityRaw}". Must be a positive number`);
    }

    // Validate price
    if (!priceRaw) {
      errors.push('Price is required');
    } else if (!isPositiveDecimal(priceRaw)) {
      errors.push(`Invalid price: "${priceRaw}". Must be a positive number`);
    }

    // Validate date
    if (!dateRaw) {
      errors.push('Date is required');
    } else if (!isValidDate(dateRaw)) {
      errors.push(`Invalid date: "${dateRaw}". Must be YYYY-MM-DD`);
    }

    // Validate fees (optional)
    const fees = feesRaw || '0';
    if (feesRaw && !isNonNegativeDecimal(feesRaw)) {
      errors.push(`Invalid fees: "${feesRaw}". Must be a non-negative number`);
    }

    if (errors.length > 0) {
      results.push({ lineNumber, raw, parsed: null, errors });
    } else {
      results.push({
        lineNumber,
        raw,
        parsed: {
          symbol,
          type: typeUpper as 'BUY' | 'SELL',
          quantity: quantityRaw,
          price: priceRaw,
          date: dateRaw,
          fees,
          notes: notesRaw,
        },
        errors: [],
      });
    }
  }

  return results;
}
