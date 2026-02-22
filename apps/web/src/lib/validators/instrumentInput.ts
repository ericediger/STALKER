import { z } from 'zod';

export const instrumentInputSchema = z.object({
  symbol: z
    .string()
    .min(1, 'Symbol is required')
    .transform((s) => s.toUpperCase().trim()),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['STOCK', 'ETF', 'FUND']),
  exchange: z.string().optional().default('NYSE'),
});

export type InstrumentInput = z.infer<typeof instrumentInputSchema>;
