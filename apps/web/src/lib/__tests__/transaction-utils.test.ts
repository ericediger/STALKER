import { describe, it, expect } from "vitest";
import {
  validateTransactionForm,
  formatTransactionForApi,
  sortTransactions,
  type TransactionFormFields,
  type TransactionRow,
} from "../transaction-utils";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function validFields(
  overrides: Partial<TransactionFormFields> = {},
): TransactionFormFields {
  return {
    instrumentId: "01HX1234",
    type: "BUY",
    quantity: "100",
    price: "185.50",
    tradeAt: "2026-02-20",
    fees: "9.99",
    notes: "test note",
    ...overrides,
  };
}

function makeTx(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "tx-1",
    instrumentId: "inst-1",
    type: "BUY",
    quantity: "100",
    price: "185.50",
    fees: "4.95",
    tradeAt: "2026-01-15T12:00:00.000Z",
    notes: null,
    symbol: "AAPL",
    instrumentName: "Apple Inc.",
    createdAt: "2026-01-15T12:00:00.000Z",
    updatedAt: "2026-01-15T12:00:00.000Z",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  validateTransactionForm                                                    */
/* -------------------------------------------------------------------------- */

describe("validateTransactionForm", () => {
  it("returns valid for correct inputs", () => {
    const result = validateTransactionForm(validFields());
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it("requires instrumentId", () => {
    const result = validateTransactionForm(
      validFields({ instrumentId: "" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.instrumentId).toBe("Instrument is required");
  });

  it("requires type to be BUY or SELL", () => {
    const result = validateTransactionForm(
      validFields({ type: "HOLD" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.type).toBe("Type must be BUY or SELL");
  });

  it("accepts SELL type", () => {
    const result = validateTransactionForm(validFields({ type: "SELL" }));
    expect(result.valid).toBe(true);
  });

  it("requires quantity", () => {
    const result = validateTransactionForm(
      validFields({ quantity: "" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.quantity).toBe("Quantity is required");
  });

  it("requires quantity > 0", () => {
    const result = validateTransactionForm(
      validFields({ quantity: "0" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.quantity).toBe(
      "Quantity must be greater than zero",
    );
  });

  it("rejects negative quantity", () => {
    const result = validateTransactionForm(
      validFields({ quantity: "-5" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.quantity).toBeDefined();
  });

  it("rejects non-numeric quantity", () => {
    const result = validateTransactionForm(
      validFields({ quantity: "abc" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.quantity).toBe("Invalid quantity");
  });

  it("accepts fractional quantity", () => {
    const result = validateTransactionForm(
      validFields({ quantity: "0.5" }),
    );
    expect(result.valid).toBe(true);
  });

  it("requires price", () => {
    const result = validateTransactionForm(validFields({ price: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.price).toBe("Price is required");
  });

  it("requires price > 0", () => {
    const result = validateTransactionForm(validFields({ price: "0" }));
    expect(result.valid).toBe(false);
    expect(result.errors.price).toBe("Price must be greater than zero");
  });

  it("requires tradeAt", () => {
    const result = validateTransactionForm(
      validFields({ tradeAt: "" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.tradeAt).toBe("Date is required");
  });

  it("rejects invalid date", () => {
    const result = validateTransactionForm(
      validFields({ tradeAt: "not-a-date" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.tradeAt).toBe("Invalid date");
  });

  it("allows empty fees (defaults to 0)", () => {
    const result = validateTransactionForm(validFields({ fees: "" }));
    expect(result.valid).toBe(true);
  });

  it("rejects negative fees", () => {
    const result = validateTransactionForm(
      validFields({ fees: "-5" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.fees).toBe("Fees cannot be negative");
  });

  it("rejects non-numeric fees", () => {
    const result = validateTransactionForm(
      validFields({ fees: "abc" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.fees).toBe("Invalid fees");
  });

  it("collects multiple errors at once", () => {
    const result = validateTransactionForm({
      instrumentId: "",
      type: "INVALID",
      quantity: "",
      price: "",
      tradeAt: "",
      fees: "",
      notes: "",
    });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(4);
  });
});

/* -------------------------------------------------------------------------- */
/*  formatTransactionForApi                                                    */
/* -------------------------------------------------------------------------- */

describe("formatTransactionForApi", () => {
  it("converts date to ISO UTC at noon", () => {
    const result = formatTransactionForApi(validFields());
    expect(result.tradeAt).toBe("2026-02-20T12:00:00.000Z");
  });

  it("passes through quantity and price as strings", () => {
    const result = formatTransactionForApi(
      validFields({ quantity: "50.5", price: "123.45" }),
    );
    expect(result.quantity).toBe("50.5");
    expect(result.price).toBe("123.45");
  });

  it("defaults fees to '0' when empty", () => {
    const result = formatTransactionForApi(validFields({ fees: "" }));
    expect(result.fees).toBe("0");
  });

  it("includes notes when present", () => {
    const result = formatTransactionForApi(
      validFields({ notes: "my note" }),
    );
    expect(result.notes).toBe("my note");
  });

  it("omits notes when empty", () => {
    const result = formatTransactionForApi(validFields({ notes: "" }));
    expect(result.notes).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  sortTransactions                                                           */
/* -------------------------------------------------------------------------- */

describe("sortTransactions", () => {
  const txA = makeTx({
    id: "1",
    symbol: "AAPL",
    tradeAt: "2026-01-10T12:00:00.000Z",
    quantity: "50",
    price: "150.00",
    fees: "5.00",
    type: "BUY",
  });
  const txB = makeTx({
    id: "2",
    symbol: "MSFT",
    tradeAt: "2026-01-20T12:00:00.000Z",
    quantity: "100",
    price: "300.00",
    fees: "10.00",
    type: "SELL",
  });
  const txC = makeTx({
    id: "3",
    symbol: "GOOG",
    tradeAt: "2026-01-15T12:00:00.000Z",
    quantity: "25",
    price: "200.00",
    fees: "2.50",
    type: "BUY",
  });

  const txs = [txA, txB, txC];

  it("sorts by date ascending", () => {
    const sorted = sortTransactions(txs, "tradeAt", "asc");
    expect(sorted.map((t) => t.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by date descending", () => {
    const sorted = sortTransactions(txs, "tradeAt", "desc");
    expect(sorted.map((t) => t.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by symbol ascending", () => {
    const sorted = sortTransactions(txs, "symbol", "asc");
    expect(sorted.map((t) => t.symbol)).toEqual(["AAPL", "GOOG", "MSFT"]);
  });

  it("sorts by type ascending", () => {
    const sorted = sortTransactions(txs, "type", "asc");
    expect(sorted[0]?.type).toBe("BUY");
    expect(sorted[2]?.type).toBe("SELL");
  });

  it("sorts by quantity ascending", () => {
    const sorted = sortTransactions(txs, "quantity", "asc");
    expect(sorted.map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts by price ascending", () => {
    const sorted = sortTransactions(txs, "price", "asc");
    expect(sorted.map((t) => t.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by fees ascending", () => {
    const sorted = sortTransactions(txs, "fees", "asc");
    expect(sorted.map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts by total (qty * price) ascending", () => {
    // A: 50*150=7500, B: 100*300=30000, C: 25*200=5000
    const sorted = sortTransactions(txs, "total", "asc");
    expect(sorted.map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts by total descending", () => {
    const sorted = sortTransactions(txs, "total", "desc");
    expect(sorted.map((t) => t.id)).toEqual(["2", "1", "3"]);
  });

  it("does not mutate the original array", () => {
    const original = [...txs];
    sortTransactions(txs, "tradeAt", "asc");
    expect(txs.map((t) => t.id)).toEqual(original.map((t) => t.id));
  });
});
