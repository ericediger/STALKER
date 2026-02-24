import type { PriceLookup } from '@stalker/analytics';
import type { PrismaClient } from '@prisma/client';
import { toDecimal } from '@stalker/shared';
import type { Decimal } from '@stalker/shared';

/**
 * Accepts PrismaClient or a Prisma interactive transaction client.
 * Both expose the same model delegate for priceBar.
 */
type PrismaLike = Pick<PrismaClient, 'priceBar'>;

export class PrismaPriceLookup implements PriceLookup {
  constructor(private readonly prisma: PrismaLike) {}

  async getClosePrice(instrumentId: string, date: string): Promise<Decimal | null> {
    const bar = await this.prisma.priceBar.findFirst({
      where: { instrumentId, resolution: '1D', date },
    });
    return bar ? toDecimal(bar.close.toString()) : null;
  }

  async getClosePriceOrCarryForward(
    instrumentId: string,
    date: string,
  ): Promise<{
    price: Decimal;
    actualDate: string;
    isCarryForward: boolean;
  } | null> {
    const bar = await this.prisma.priceBar.findFirst({
      where: { instrumentId, resolution: '1D', date: { lte: date } },
      orderBy: { date: 'desc' },
    });
    if (!bar) return null;
    return {
      price: toDecimal(bar.close.toString()),
      actualDate: bar.date,
      isCarryForward: bar.date !== date,
    };
  }

  async getFirstBarDate(instrumentId: string): Promise<string | null> {
    const bar = await this.prisma.priceBar.findFirst({
      where: { instrumentId, resolution: '1D' },
      orderBy: { date: 'asc' },
    });
    return bar ? bar.date : null;
  }
}
