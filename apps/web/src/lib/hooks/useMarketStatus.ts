"use client";

import { useState, useEffect } from "react";

export interface StaleInstrument {
  symbol: string;
  lastUpdated: string;
  minutesStale: number;
}

export interface ProviderBudget {
  provider: string;
  usedToday: number;
  dailyLimit: number;
  usedThisHour?: number;
  hourlyLimit?: number;
}

export interface MarketStatus {
  instrumentCount: number;
  pollingInterval: number;
  pollingActive: boolean;
  budget: {
    primary: ProviderBudget;
    secondary: ProviderBudget;
  };
  freshness: {
    allFreshWithinMinutes: number | null;
    staleInstruments: StaleInstrument[];
  };
}

export function useMarketStatus() {
  const [data, setData] = useState<MarketStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/market/status")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, []);

  return { data, isLoading, error };
}
