export type StalenessVariant = 'hidden' | 'amber-standard' | 'amber-detailed' | 'blue-updating';

export interface StalenessState {
  variant: StalenessVariant;
  text: string;
}

/**
 * Determine staleness banner variant and text based on stale/total ratio.
 *
 * - 0%: hidden
 * - 1–30%: amber-standard (simple count)
 * - 31–79%: amber-detailed (stale and fresh counts)
 * - 80–100%: blue-updating ("prices updating" language)
 */
export function getStalenessState(staleCount: number, totalInstruments: number): StalenessState {
  if (staleCount === 0 || totalInstruments === 0) {
    return { variant: 'hidden', text: '' };
  }

  const staleRatio = staleCount / totalInstruments;
  const freshCount = totalInstruments - staleCount;

  if (staleRatio >= 0.8) {
    return {
      variant: 'blue-updating',
      text: `Prices updating — ${freshCount} of ${totalInstruments} instruments refreshed so far`,
    };
  }

  if (staleRatio > 0.3) {
    return {
      variant: 'amber-detailed',
      text: `${staleCount} of ${totalInstruments} instruments have stale prices. ${freshCount} instruments current.`,
    };
  }

  return {
    variant: 'amber-standard',
    text: `${staleCount} instrument${staleCount === 1 ? ' has' : 's have'} stale prices`,
  };
}
