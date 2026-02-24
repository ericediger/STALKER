import type { SnapshotStore } from '@stalker/analytics';
import type { PortfolioValueSnapshot, HoldingSnapshot } from '@stalker/shared';
import type { PrismaClient, PortfolioValueSnapshot as PrismaSnapshot } from '@prisma/client';
import { toDecimal } from '@stalker/shared';
/**
 * Convert a Prisma PortfolioValueSnapshot row to the shared PortfolioValueSnapshot type.
 * Prisma Decimal != decimal.js Decimal, so we convert via toString().
 * holdingsJson is stored as a JSON string; parse and convert string values back to Decimal.
 */
function rowToSnapshot(row: PrismaSnapshot): PortfolioValueSnapshot {
  const parsed = JSON.parse(row.holdingsJson) as Record<
    string,
    { qty: string; value: string; costBasis: string; isEstimated?: boolean; costBasisOnly?: boolean }
  >;

  const holdingsJson: Record<string, HoldingSnapshot> = {};
  for (const [symbol, entry] of Object.entries(parsed)) {
    holdingsJson[symbol] = {
      qty: toDecimal(entry.qty),
      value: toDecimal(entry.value),
      costBasis: toDecimal(entry.costBasis),
    };
  }

  return {
    id: row.id,
    date: row.date,
    totalValue: toDecimal(row.totalValue.toString()),
    totalCostBasis: toDecimal(row.totalCostBasis.toString()),
    realizedPnl: toDecimal(row.realizedPnl.toString()),
    unrealizedPnl: toDecimal(row.unrealizedPnl.toString()),
    holdingsJson,
    rebuiltAt: row.rebuiltAt,
  };
}

/**
 * Serializer for holdingsJson Decimal values: converts anything with .toFixed to its string repr.
 */
function serializeHoldings(holdingsJson: Record<string, HoldingSnapshot>): string {
  return JSON.stringify(holdingsJson, (_key: string, value: unknown) => {
    if (value !== null && typeof value === 'object' && 'toFixed' in (value as Record<string, unknown>)) {
      return (value as { toString(): string }).toString();
    }
    return value;
  });
}

/**
 * Accepts PrismaClient or a Prisma interactive transaction client.
 * Both expose the same model delegate for portfolioValueSnapshot.
 */
type PrismaLike = Pick<PrismaClient, 'portfolioValueSnapshot'>;

export class PrismaSnapshotStore implements SnapshotStore {
  constructor(private readonly prisma: PrismaLike) {}

  async deleteFrom(date: string): Promise<number> {
    const result = await this.prisma.portfolioValueSnapshot.deleteMany({
      where: { date: { gte: date } },
    });
    return result.count;
  }

  async writeBatch(snapshots: PortfolioValueSnapshot[]): Promise<void> {
    for (const s of snapshots) {
      await this.prisma.portfolioValueSnapshot.upsert({
        where: { date: s.date },
        create: {
          date: s.date,
          totalValue: s.totalValue.toString(),
          totalCostBasis: s.totalCostBasis.toString(),
          realizedPnl: s.realizedPnl.toString(),
          unrealizedPnl: s.unrealizedPnl.toString(),
          holdingsJson: serializeHoldings(s.holdingsJson),
          rebuiltAt: s.rebuiltAt,
        },
        update: {
          totalValue: s.totalValue.toString(),
          totalCostBasis: s.totalCostBasis.toString(),
          realizedPnl: s.realizedPnl.toString(),
          unrealizedPnl: s.unrealizedPnl.toString(),
          holdingsJson: serializeHoldings(s.holdingsJson),
          rebuiltAt: s.rebuiltAt,
        },
      });
    }
  }

  async getRange(startDate: string, endDate: string): Promise<PortfolioValueSnapshot[]> {
    const rows = await this.prisma.portfolioValueSnapshot.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });
    return rows.map(rowToSnapshot);
  }

  async getByDate(date: string): Promise<PortfolioValueSnapshot | null> {
    const row = await this.prisma.portfolioValueSnapshot.findUnique({
      where: { date },
    });
    return row ? rowToSnapshot(row) : null;
  }
}
