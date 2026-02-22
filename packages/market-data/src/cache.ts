import type { Decimal } from '@stalker/shared';

/**
 * Minimal Prisma client interface for LatestQuote operations.
 * This avoids a hard dependency on @prisma/client while remaining type-safe.
 * The real Prisma client satisfies this interface.
 */
export interface LatestQuoteRecord {
  id: number;
  instrumentId: string;
  provider: string;
  price: Decimal;
  asOf: Date;
  fetchedAt: Date;
  rebuiltAt: Date;
}

export interface PrismaLatestQuoteDelegate {
  upsert(args: {
    where: { instrumentId_provider: { instrumentId: string; provider: string } };
    create: {
      instrumentId: string;
      provider: string;
      price: Decimal;
      asOf: Date;
      fetchedAt: Date;
      rebuiltAt: Date;
    };
    update: {
      price: Decimal;
      asOf: Date;
      fetchedAt: Date;
      rebuiltAt: Date;
    };
  }): Promise<LatestQuoteRecord>;

  findFirst(args: {
    where: { instrumentId: string };
    orderBy: { fetchedAt: 'desc' };
  }): Promise<LatestQuoteRecord | null>;
}

export interface PrismaClientForCache {
  latestQuote: PrismaLatestQuoteDelegate;
}

/**
 * Upsert a LatestQuote record for an instrument+provider pair.
 * Uses the (instrumentId, provider) unique constraint.
 */
export async function upsertQuote(
  prisma: PrismaClientForCache,
  instrumentId: string,
  provider: string,
  price: Decimal,
  asOf: Date
): Promise<LatestQuoteRecord> {
  const now = new Date();
  return prisma.latestQuote.upsert({
    where: {
      instrumentId_provider: { instrumentId, provider },
    },
    create: {
      instrumentId,
      provider,
      price,
      asOf,
      fetchedAt: now,
      rebuiltAt: now,
    },
    update: {
      price,
      asOf,
      fetchedAt: now,
      rebuiltAt: now,
    },
  });
}

/**
 * Get the most recent LatestQuote for an instrument across all providers.
 * Returns the quote with the most recent fetchedAt, or null if none exists.
 */
export async function getLatestQuote(
  prisma: PrismaClientForCache,
  instrumentId: string
): Promise<LatestQuoteRecord | null> {
  return prisma.latestQuote.findFirst({
    where: { instrumentId },
    orderBy: { fetchedAt: 'desc' },
  });
}

/**
 * Determines if a cached quote is still "fresh" enough to use.
 * - During market hours: fresh if < 1 hour old
 * - Outside market hours: fresh if < 24 hours old
 */
export function isQuoteFresh(
  quote: LatestQuoteRecord,
  isMarketOpen: boolean
): boolean {
  const ageMs = Date.now() - quote.fetchedAt.getTime();
  const oneHourMs = 60 * 60 * 1000;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  if (isMarketOpen) {
    return ageMs < oneHourMs;
  }
  return ageMs < twentyFourHoursMs;
}
