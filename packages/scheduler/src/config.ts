import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

export interface SchedulerConfig {
  databaseUrl: string;
  fmpApiKey: string;
  alphaVantageApiKey: string | undefined;
  pollIntervalSeconds: number;
  postCloseDelaySeconds: number;
  fmpRpm: number;
  fmpRpd: number;
  avRpm: number;
  avRpd: number;
}

/**
 * Load scheduler configuration from environment variables.
 * Searches for .env.local in the project root and apps/web/.
 * Fails fast with a descriptive error if required vars are missing.
 */
export function loadConfig(): SchedulerConfig {
  // Try project root .env.local first, then apps/web/.env.local
  const projectRoot = resolve(import.meta.dirname, '..', '..', '..');
  dotenvConfig({ path: resolve(projectRoot, '.env.local') });
  dotenvConfig({ path: resolve(projectRoot, 'apps', 'web', '.env.local') });

  const missing: string[] = [];

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    missing.push('DATABASE_URL');
  }

  const fmpApiKey = process.env['FMP_API_KEY'];
  if (!fmpApiKey) {
    missing.push('FMP_API_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `[scheduler] Missing required environment variables: ${missing.join(', ')}. ` +
      `Set them in .env.local at the project root or apps/web/.env.local.`
    );
  }

  const pollIntervalSeconds = parseIntEnv('POLL_INTERVAL_MARKET_HOURS', 1800);
  const postCloseDelaySeconds = parseIntEnv('POST_CLOSE_DELAY', 900);
  const fmpRpm = parseIntEnv('FMP_RPM', 5);
  const fmpRpd = parseIntEnv('FMP_RPD', 250);
  const avRpm = parseIntEnv('AV_RPM', 5);
  const avRpd = parseIntEnv('AV_RPD', 25);

  return {
    // Non-null assertions are safe here — we checked above and would have thrown
    databaseUrl: databaseUrl!,
    fmpApiKey: fmpApiKey!,
    alphaVantageApiKey: process.env['ALPHA_VANTAGE_API_KEY'],
    pollIntervalSeconds,
    postCloseDelaySeconds,
    fmpRpm,
    fmpRpd,
    avRpm,
    avRpd,
  };
}

function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    console.warn(`[scheduler] Invalid integer for ${name}="${raw}", using default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}
