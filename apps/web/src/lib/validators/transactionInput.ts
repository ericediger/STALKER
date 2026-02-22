import { z } from 'zod';

const positiveDecimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal number')
  .refine((s) => parseFloat(s) > 0, 'Must be greater than zero');

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal number');

export const transactionInputSchema = z.object({
  instrumentId: z.string().min(1, 'instrumentId is required'),
  type: z.enum(['BUY', 'SELL']),
  quantity: positiveDecimalString,
  price: positiveDecimalString,
  tradeAt: z.string().datetime({ message: 'tradeAt must be a valid ISO datetime string' }),
  fees: decimalString.optional().default('0'),
  notes: z.string().optional(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
