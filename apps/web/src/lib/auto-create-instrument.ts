import { prisma } from '@/lib/prisma';
import { getMarketDataService } from '@/lib/market-data-service';
import {
  generateUlid,
  EXCHANGE_TIMEZONE_MAP,
  DEFAULT_TIMEZONE,
} from '@stalker/shared';
import type { Instrument, InstrumentType } from '@stalker/shared';

/**
 * Build the tiingo symbol from the canonical symbol.
 * Tiingo uses hyphens where FMP/exchanges use dots (e.g. BRK.B → BRK-B).
 */
function buildTiingoSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-');
}

function mapExchange(exchange: string | undefined): string {
  if (!exchange) return 'NYSE';
  const upper = exchange.toUpperCase();
  if (upper.includes('NASDAQ') || upper === 'NMS' || upper === 'NGS' || upper === 'NAS') return 'NASDAQ';
  if (upper.includes('NYSE') || upper === 'NYQ' || upper === 'PCX' || upper === 'AMEX' || upper === 'ARCA' || upper === 'BATS') return 'NYSE';
  if (upper.includes('CBOE') || upper === 'BZX') return 'CBOE';
  return 'NYSE';
}

function mapType(type: string | undefined): string {
  if (!type) return 'STOCK';
  const upper = type.toUpperCase();
  if (upper === 'ETF' || upper.includes('ETF')) return 'ETF';
  if (upper === 'FUND' || upper.includes('FUND')) return 'FUND';
  return 'STOCK';
}

interface PrismaInstrument {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
  exchangeTz: string;
  providerSymbolMap: string;
  firstBarDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Find or create an instrument by symbol.
 *
 * If the instrument already exists, returns it immediately.
 * If not, tries FMP search to get name/exchange/type, creates the instrument,
 * and triggers a Tiingo backfill (fire-and-forget unless skipBackfill is set).
 *
 * @param skipBackfill - If true, don't trigger backfill (caller will handle it).
 *   Useful when creating many instruments at once to avoid SQLite write contention.
 *
 * Returns the Prisma instrument row.
 */
export async function findOrCreateInstrument(symbol: string, skipBackfill = false): Promise<PrismaInstrument> {
  const upper = symbol.toUpperCase().trim();

  // Check if instrument already exists
  const existing = await prisma.instrument.findUnique({
    where: { symbol: upper },
  });
  if (existing) {
    return existing;
  }

  // Try FMP search to get metadata, with Tiingo fallback
  let name = upper;
  let exchange = 'NYSE';
  let type = 'STOCK';

  try {
    const service = getMarketDataService();
    const results = await service.searchSymbols(upper);
    if (results.length > 0) {
      const match = results.find(
        (r) => r.symbol.toUpperCase() === upper,
      ) ?? results[0];
      if (match) {
        name = match.name || upper;
        exchange = mapExchange(match.exchange);
        type = mapType(match.type);
      }
    }

    // If FMP didn't resolve a name, try Tiingo metadata as fallback
    if (name === upper) {
      try {
        const tiingoSymbol = buildTiingoSymbol(upper).toLowerCase();
        const tiingoKey = process.env.TIINGO_API_KEY;
        if (tiingoKey) {
          const res = await fetch(
            `https://api.tiingo.com/tiingo/daily/${tiingoSymbol}`,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${tiingoKey}`,
              },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (res.ok) {
            const meta = await res.json() as { name?: string; exchangeCode?: string };
            if (meta.name) {
              name = meta.name;
            }
            if (meta.exchangeCode) {
              const mappedExch = mapExchange(meta.exchangeCode);
              if (mappedExch !== 'NYSE' || exchange === 'NYSE') {
                exchange = mappedExch;
              }
            }
          }
        }
      } catch {
        // Tiingo fallback failed — use defaults
      }
    }
  } catch {
    // Search failed — use defaults
  }

  const exchangeTz = EXCHANGE_TIMEZONE_MAP[exchange] ?? DEFAULT_TIMEZONE;
  const providerSymbolMap: Record<string, string> = {
    fmp: upper,
    tiingo: buildTiingoSymbol(upper),
  };

  const id = generateUlid();

  const instrument = await prisma.instrument.create({
    data: {
      id,
      symbol: upper,
      name,
      type,
      exchange,
      exchangeTz,
      providerSymbolMap: JSON.stringify(providerSymbolMap),
      firstBarDate: null,
    },
  });

  // Trigger backfill fire-and-forget (unless caller opts out)
  if (!skipBackfill) {
    triggerBackfill(instrument).catch((err: unknown) => {
      console.error(`Backfill failed for ${upper}:`, err);
    });
  }

  return instrument;
}

/**
 * Fetch ~10 years of daily price bars from Tiingo and bulk-insert into PriceBar table.
 * Updates firstBarDate on the instrument after successful backfill.
 */
export async function triggerBackfill(prismaInst: PrismaInstrument): Promise<void> {
  const service = getMarketDataService();

  const domainInstrument: Instrument = {
    ...prismaInst,
    type: prismaInst.type as InstrumentType,
    providerSymbolMap: JSON.parse(prismaInst.providerSymbolMap) as Record<string, string>,
  };

  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);

  const bars = await service.getHistory(domainInstrument, start, end);

  if (bars.length === 0) {
    console.warn(`No bars returned for ${prismaInst.symbol} — backfill skipped`);
    return;
  }

  await prisma.priceBar.createMany({
    data: bars.map((bar) => ({
      instrumentId: prismaInst.id,
      provider: bar.provider,
      resolution: bar.resolution,
      date: bar.date,
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
  });

  const sortedDates = bars.map((b) => b.date).sort();
  const firstBarDate = sortedDates[0] ?? null;

  if (firstBarDate) {
    await prisma.instrument.update({
      where: { id: prismaInst.id },
      data: { firstBarDate },
    });
  }

  console.log(
    `Backfill complete for ${prismaInst.symbol}: ${bars.length} bars, firstBarDate=${firstBarDate}`,
  );
}
