import { PrismaClient } from '@prisma/client';
import { generateUlid } from '@stalker/shared';

const prisma = new PrismaClient();

interface InstrumentSeed {
  symbol: string;
  name: string;
  type: 'STOCK' | 'ETF';
  exchange: string;
  startPrice: number;
  buyQty: number;
  buyPrice: number;
}

/**
 * All instruments to seed. Back-purchased on 2025-01-02.
 */
const instruments: InstrumentSeed[] = [
  // Original 3
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'STOCK', exchange: 'NASDAQ', startPrice: 184, buyQty: 100, buyPrice: 185.50 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'STOCK', exchange: 'NASDAQ', startPrice: 418, buyQty: 50, buyPrice: 420.00 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'STOCK', exchange: 'NASDAQ', startPrice: 173, buyQty: 75, buyPrice: 175.00 },

  // User-requested — AI & Robotics ETFs
  { symbol: 'TOPT', name: 'T-Rex 2X Long Magnificent 7 ETF', type: 'ETF', exchange: 'CBOE', startPrice: 42, buyQty: 200, buyPrice: 42.50 },
  { symbol: 'QTOP', name: 'Defiance QTOP ETF', type: 'ETF', exchange: 'NASDAQ', startPrice: 35, buyQty: 250, buyPrice: 35.25 },
  { symbol: 'BOTZ', name: 'Global X Robotics & AI ETF', type: 'ETF', exchange: 'NASDAQ', startPrice: 28, buyQty: 300, buyPrice: 28.10 },
  { symbol: 'ROBO', name: 'ROBO Global Robotics & Automation Index ETF', type: 'ETF', exchange: 'NYSE', startPrice: 55, buyQty: 150, buyPrice: 55.20 },
  { symbol: 'ROBT', name: 'First Trust Nasdaq AI & Robotics ETF', type: 'ETF', exchange: 'NASDAQ', startPrice: 42, buyQty: 200, buyPrice: 42.00 },
  { symbol: 'CHAT', name: 'Roundhill Generative AI & Technology ETF', type: 'ETF', exchange: 'NYSE', startPrice: 32, buyQty: 250, buyPrice: 32.50 },
  { symbol: 'LQAI', name: 'LG QRAFT AI-Powered US Large Cap Core ETF', type: 'ETF', exchange: 'NYSE', startPrice: 38, buyQty: 200, buyPrice: 38.00 },
  { symbol: 'AIQ', name: 'Global X AI & Technology ETF', type: 'ETF', exchange: 'NASDAQ', startPrice: 33, buyQty: 250, buyPrice: 33.25 },

  // Semiconductor & Tech
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', type: 'ETF', exchange: 'NASDAQ', startPrice: 215, buyQty: 40, buyPrice: 216.00 },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'ETF', exchange: 'NYSE', startPrice: 48, buyQty: 175, buyPrice: 48.50 },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', type: 'ETF', exchange: 'NASDAQ', startPrice: 240, buyQty: 35, buyPrice: 241.00 },

  // Broad Tech / Index
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF', exchange: 'NASDAQ', startPrice: 430, buyQty: 20, buyPrice: 431.50 },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', type: 'ETF', exchange: 'NYSE', startPrice: 205, buyQty: 40, buyPrice: 206.00 },
  { symbol: 'IYW', name: 'iShares U.S. Technology ETF', type: 'ETF', exchange: 'NYSE', startPrice: 132, buyQty: 60, buyPrice: 132.50 },
  { symbol: 'VGT', name: 'Vanguard Information Technology ETF', type: 'ETF', exchange: 'NYSE', startPrice: 530, buyQty: 15, buyPrice: 531.00 },
  { symbol: 'FDN', name: 'First Trust Dow Jones Internet Index Fund', type: 'ETF', exchange: 'NYSE', startPrice: 210, buyQty: 40, buyPrice: 211.00 },
  { symbol: 'MRVL', name: 'Marvell Technology Inc.', type: 'STOCK', exchange: 'NASDAQ', startPrice: 72, buyQty: 120, buyPrice: 72.50 },

  // Travel & Entertainment
  { symbol: 'JETS', name: 'U.S. Global Jets ETF', type: 'ETF', exchange: 'NYSE', startPrice: 19, buyQty: 400, buyPrice: 19.25 },
  { symbol: 'CRUZ', name: 'Defiance Hotel Airline & Cruise ETF', type: 'ETF', exchange: 'NYSE', startPrice: 22, buyQty: 350, buyPrice: 22.10 },
  { symbol: 'PEJ', name: 'Invesco Dynamic Leisure & Entertainment ETF', type: 'ETF', exchange: 'NYSE', startPrice: 45, buyQty: 175, buyPrice: 45.50 },

  // Broad Market
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', exchange: 'NYSE', startPrice: 260, buyQty: 30, buyPrice: 261.00 },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'ETF', exchange: 'NYSE', startPrice: 480, buyQty: 18, buyPrice: 481.00 },
  { symbol: 'SCHX', name: 'Schwab U.S. Large-Cap ETF', type: 'ETF', exchange: 'NYSE', startPrice: 60, buyQty: 130, buyPrice: 60.25 },
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', type: 'ETF', exchange: 'NYSE', startPrice: 42, buyQty: 200, buyPrice: 42.10 },
  { symbol: 'SPYV', name: 'SPDR Portfolio S&P 500 Value ETF', type: 'ETF', exchange: 'NYSE', startPrice: 48, buyQty: 175, buyPrice: 48.25 },
];

/**
 * Generate daily price bars for an instrument over a date range.
 * Simulates a random walk from a starting price with ~1% daily volatility.
 */
function generatePriceBars(
  instrumentId: string,
  startDate: string,
  endDate: string,
  startPrice: number,
): Array<{
  instrumentId: string;
  provider: string;
  resolution: string;
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
}> {
  const bars: Array<{
    instrumentId: string;
    provider: string;
    resolution: string;
    date: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: number;
  }> = [];
  let price = startPrice;
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue; // Skip weekends

    const open = price;
    const change = (Math.random() - 0.47) * price * 0.015; // Slight upward bias
    const close = Math.max(open + change, open * 0.95);
    const high = Math.max(open, close) + Math.random() * price * 0.005;
    const low = Math.min(open, close) - Math.random() * price * 0.005;

    const dateStr = d.toISOString().split('T')[0]!;
    bars.push({
      instrumentId,
      provider: 'fmp',
      resolution: '1D',
      date: dateStr,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: Math.floor(5_000_000 + Math.random() * 50_000_000),
    });
    price = close;
  }
  return bars;
}

async function main(): Promise<void> {
  console.log('Clearing existing data...');
  await prisma.portfolioValueSnapshot.deleteMany();
  await prisma.latestQuote.deleteMany();
  await prisma.priceBar.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.instrument.deleteMany();

  const dateRange = { start: '2025-01-02', end: '2026-02-21' };
  const now = new Date();
  let totalBars = 0;

  for (const inst of instruments) {
    const id = generateUlid();

    // Create instrument
    await prisma.instrument.create({
      data: {
        id,
        symbol: inst.symbol,
        name: inst.name,
        type: inst.type,
        currency: 'USD',
        exchange: inst.exchange,
        exchangeTz: 'America/New_York',
        providerSymbolMap: JSON.stringify({
          fmp: inst.symbol,
          stooq: inst.symbol.toLowerCase() + '.us',
        }),
        firstBarDate: dateRange.start,
      },
    });

    // Create BUY transaction on 2025-01-02
    await prisma.transaction.create({
      data: {
        id: generateUlid(),
        instrumentId: id,
        type: 'BUY',
        quantity: String(inst.buyQty),
        price: inst.buyPrice.toFixed(2),
        fees: '4.95',
        tradeAt: new Date('2025-01-02T15:00:00Z'),
      },
    });

    // Generate price bars
    const bars = generatePriceBars(id, dateRange.start, dateRange.end, inst.startPrice);
    totalBars += bars.length;

    // Batch insert price bars (SQLite supports createMany)
    const BATCH_SIZE = 500;
    for (let i = 0; i < bars.length; i += BATCH_SIZE) {
      await prisma.priceBar.createMany({
        data: bars.slice(i, i + BATCH_SIZE),
      });
    }

    // Latest quote from most recent bar
    const lastBar = bars[bars.length - 1];
    if (lastBar) {
      // Make a few instruments stale for testing staleness indicators
      const isStale = ['GOOGL', 'JETS', 'VWO'].includes(inst.symbol);
      const quoteTime = isStale
        ? new Date(now.getTime() - 4 * 60 * 60 * 1000) // 4 hours ago
        : new Date(now.getTime() - 10 * 60 * 1000);     // 10 minutes ago

      await prisma.latestQuote.create({
        data: {
          instrumentId: id,
          provider: 'fmp',
          price: lastBar.close,
          asOf: quoteTime,
          fetchedAt: quoteTime,
          rebuiltAt: quoteTime,
        },
      });
    }

    process.stdout.write(`  ${inst.symbol} `);
  }

  // Add some extra transactions for AAPL (partial sell for realized PnL)
  const aaplInst = await prisma.instrument.findUnique({ where: { symbol: 'AAPL' } });
  if (aaplInst) {
    await prisma.transaction.create({
      data: {
        id: generateUlid(),
        instrumentId: aaplInst.id,
        type: 'SELL',
        quantity: '30',
        price: '195.00',
        fees: '4.95',
        tradeAt: new Date('2025-06-15T15:30:00Z'),
      },
    });
  }

  // Add extra BUY for MSFT (cost averaging)
  const msftInst = await prisma.instrument.findUnique({ where: { symbol: 'MSFT' } });
  if (msftInst) {
    await prisma.transaction.create({
      data: {
        id: generateUlid(),
        instrumentId: msftInst.id,
        type: 'BUY',
        quantity: '25',
        price: '415.00',
        fees: '4.95',
        tradeAt: new Date('2025-09-10T14:00:00Z'),
      },
    });
  }

  console.log(`\n\nSeed complete:`);
  console.log(`  ${instruments.length} instruments`);
  console.log(`  ${instruments.length + 2} transactions (${instruments.length} initial BUYs + 1 SELL + 1 extra BUY)`);
  console.log(`  ${totalBars} price bars (${dateRange.start} to ${dateRange.end})`);
  console.log(`  ${instruments.length} latest quotes (3 intentionally stale: GOOGL, JETS, VWO)`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
