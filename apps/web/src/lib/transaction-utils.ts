import { toDecimal, mul, gt, ZERO } from "@stalker/shared";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TransactionFormFields {
  instrumentId: string;
  type: string;
  quantity: string;
  price: string;
  tradeAt: string; // YYYY-MM-DD from date input
  fees: string;
  notes: string;
}

export interface TransactionFormErrors {
  instrumentId?: string;
  type?: string;
  quantity?: string;
  price?: string;
  tradeAt?: string;
  fees?: string;
}

export interface TransactionRow {
  id: string;
  instrumentId: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  fees: string;
  tradeAt: string;
  notes: string | null;
  symbol: string;
  instrumentName: string;
  createdAt: string;
  updatedAt: string;
}

export type SortColumn =
  | "tradeAt"
  | "symbol"
  | "type"
  | "quantity"
  | "price"
  | "fees"
  | "total";
export type SortDirection = "asc" | "desc";

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validateTransactionForm(
  fields: TransactionFormFields,
): { valid: boolean; errors: TransactionFormErrors } {
  const errors: TransactionFormErrors = {};

  if (!fields.instrumentId) {
    errors.instrumentId = "Instrument is required";
  }

  if (fields.type !== "BUY" && fields.type !== "SELL") {
    errors.type = "Type must be BUY or SELL";
  }

  if (!fields.quantity) {
    errors.quantity = "Quantity is required";
  } else {
    try {
      const qty = toDecimal(fields.quantity);
      if (!gt(qty, ZERO)) {
        errors.quantity = "Quantity must be greater than zero";
      }
    } catch {
      errors.quantity = "Invalid quantity";
    }
  }

  if (!fields.price) {
    errors.price = "Price is required";
  } else {
    try {
      const p = toDecimal(fields.price);
      if (!gt(p, ZERO)) {
        errors.price = "Price must be greater than zero";
      }
    } catch {
      errors.price = "Invalid price";
    }
  }

  if (!fields.tradeAt) {
    errors.tradeAt = "Date is required";
  } else {
    const date = new Date(fields.tradeAt + "T12:00:00Z");
    if (isNaN(date.getTime())) {
      errors.tradeAt = "Invalid date";
    }
  }

  if (fields.fees) {
    try {
      const f = toDecimal(fields.fees);
      if (f.isNegative()) {
        errors.fees = "Fees cannot be negative";
      }
    } catch {
      errors.fees = "Invalid fees";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/*  API Formatting                                                             */
/* -------------------------------------------------------------------------- */

export function formatTransactionForApi(
  fields: TransactionFormFields,
): {
  instrumentId: string;
  type: string;
  quantity: string;
  price: string;
  tradeAt: string;
  fees: string;
  notes?: string;
} {
  return {
    instrumentId: fields.instrumentId,
    type: fields.type,
    quantity: fields.quantity,
    price: fields.price,
    tradeAt: new Date(fields.tradeAt + "T12:00:00Z").toISOString(),
    fees: fields.fees || "0",
    ...(fields.notes ? { notes: fields.notes } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/*  Sorting                                                                    */
/* -------------------------------------------------------------------------- */

export function sortTransactions(
  txs: TransactionRow[],
  column: SortColumn,
  direction: SortDirection,
): TransactionRow[] {
  const sorted = [...txs].sort((a, b) => {
    let cmp = 0;

    switch (column) {
      case "tradeAt": {
        cmp = new Date(a.tradeAt).getTime() - new Date(b.tradeAt).getTime();
        break;
      }
      case "symbol": {
        cmp = a.symbol.localeCompare(b.symbol);
        break;
      }
      case "type": {
        cmp = a.type.localeCompare(b.type);
        break;
      }
      case "quantity": {
        cmp = toDecimal(a.quantity)
          .minus(toDecimal(b.quantity))
          .toNumber();
        break;
      }
      case "price": {
        cmp = toDecimal(a.price)
          .minus(toDecimal(b.price))
          .toNumber();
        break;
      }
      case "fees": {
        cmp = toDecimal(a.fees)
          .minus(toDecimal(b.fees))
          .toNumber();
        break;
      }
      case "total": {
        const totalA = mul(toDecimal(a.quantity), toDecimal(a.price));
        const totalB = mul(toDecimal(b.quantity), toDecimal(b.price));
        cmp = totalA.minus(totalB).toNumber();
        break;
      }
    }

    return direction === "asc" ? cmp : -cmp;
  });

  return sorted;
}
