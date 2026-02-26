/**
 * Resolve instrument names for auto-created instruments that have symbol == name.
 * Tries FMP search first, then Tiingo metadata endpoint as fallback.
 *
 * Run with: npx tsx scripts/resolve-instrument-names.ts
 *
 * AD-S14-4: This is a one-time manual script, not auto-startup.
 * FMP calls are expensive (250/day limit), so this should only run once.
 */
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../apps/web/data/portfolio.db');

// Load env vars for API keys
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

const FMP_API_KEY = process.env.FMP_API_KEY;
const TIINGO_API_KEY = process.env.TIINGO_API_KEY;

if (!FMP_API_KEY) {
  console.error('FMP_API_KEY not set in apps/web/.env.local');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: `file:${dbPath}` },
  },
});

interface FmpSearchResult {
  symbol?: string;
  name?: string;
  exchange?: string;
  type?: string;
}

interface TiingoMeta {
  name?: string;
  exchangeCode?: string;
  description?: string;
}

async function searchFmp(symbol: string): Promise<FmpSearchResult | null> {
  try {
    const url = `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(symbol)}&apikey=${FMP_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data: FmpSearchResult[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    // Find exact match first, then take first result
    return data.find((r) => r.symbol?.toUpperCase() === symbol.toUpperCase()) ?? data[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchTiingoMeta(symbol: string): Promise<TiingoMeta | null> {
  if (!TIINGO_API_KEY) return null;
  try {
    // Tiingo uses hyphens where exchanges use dots
    const tiingoSymbol = symbol.replace(/\./g, '-').toLowerCase();
    const url = `https://api.tiingo.com/tiingo/daily/${tiingoSymbol}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${TIINGO_API_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data: TiingoMeta = await res.json();
    return data;
  } catch {
    return null;
  }
}

function mapExchange(exchange: string | undefined): string {
  if (!exchange) return '';
  const upper = exchange.toUpperCase();
  if (upper.includes('NASDAQ') || upper === 'NMS' || upper === 'NGS' || upper === 'NAS') return 'NASDAQ';
  if (upper.includes('NYSE') || upper === 'NYQ' || upper === 'PCX' || upper === 'AMEX' || upper === 'ARCA' || upper === 'BATS') return 'NYSE';
  if (upper.includes('CBOE') || upper === 'BZX') return 'CBOE';
  return '';
}

function mapType(type: string | undefined): string {
  if (!type) return '';
  const upper = type.toUpperCase();
  if (upper === 'ETF' || upper.includes('ETF')) return 'ETF';
  if (upper === 'FUND' || upper.includes('FUND')) return 'FUND';
  return '';
}

async function main() {
  // Find instruments where name equals symbol (auto-create default)
  const unnamed = await prisma.instrument.findMany({
    where: {},
  });

  const needsName = unnamed.filter((inst) => inst.name === inst.symbol);
  console.log(`Found ${needsName.length} instruments needing name resolution out of ${unnamed.length} total`);

  if (needsName.length === 0) {
    console.log('All instruments already have names!');
    await prisma.$disconnect();
    return;
  }

  let resolved = 0;
  let fmpResolved = 0;
  let tiingoResolved = 0;
  let failed = 0;

  for (const inst of needsName) {
    process.stdout.write(`  ${inst.symbol}... `);

    // Try FMP first
    const fmpResult = await searchFmp(inst.symbol);
    if (fmpResult?.name && fmpResult.name !== inst.symbol) {
      const updates: Record<string, string> = { name: fmpResult.name };
      const mappedExchange = mapExchange(fmpResult.exchange);
      if (mappedExchange) updates.exchange = mappedExchange;
      const mappedType = mapType(fmpResult.type);
      if (mappedType) updates.type = mappedType;

      await prisma.instrument.update({
        where: { id: inst.id },
        data: updates,
      });
      console.log(`FMP → "${fmpResult.name}"`);
      resolved++;
      fmpResolved++;
      await delay(300);
      continue;
    }

    await delay(300);

    // Try Tiingo metadata
    const tiingoResult = await fetchTiingoMeta(inst.symbol);
    if (tiingoResult?.name && tiingoResult.name !== inst.symbol) {
      const updates: Record<string, string> = { name: tiingoResult.name };
      const mappedExchange = mapExchange(tiingoResult.exchangeCode);
      if (mappedExchange) updates.exchange = mappedExchange;

      await prisma.instrument.update({
        where: { id: inst.id },
        data: updates,
      });
      console.log(`Tiingo → "${tiingoResult.name}"`);
      resolved++;
      tiingoResolved++;
      await delay(300);
      continue;
    }

    console.log('UNRESOLVED');
    failed++;
    await delay(300);
  }

  console.log('\n=== Results ===');
  console.log(`Resolved: ${resolved} (FMP: ${fmpResolved}, Tiingo: ${tiingoResolved})`);
  console.log(`Unresolved: ${failed}`);

  await prisma.$disconnect();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
