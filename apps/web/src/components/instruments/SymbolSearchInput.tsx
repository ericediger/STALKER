"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/Input";

interface SymbolSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function SymbolSearchInput({
  value,
  onChange,
  error,
}: SymbolSearchInputProps) {
  const [searchResults, setSearchResults] = useState<
    Array<{ symbol: string; name: string; exchange: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!value || value.length < 1) {
      setSearchResults([]);
      setSearchUnavailable(false);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(value)}`,
        );
        if (!res.ok) {
          setSearchUnavailable(true);
          setSearchResults([]);
          return;
        }
        const data = (await res.json()) as {
          results: Array<{ symbol: string; name: string; exchange: string }>;
        };
        if (data.results.length === 0) {
          setSearchUnavailable(true);
        } else {
          setSearchUnavailable(false);
        }
        setSearchResults(data.results);
      } catch {
        setSearchUnavailable(true);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  return (
    <div className="space-y-2">
      <Input
        label="Search Symbol"
        type="text"
        placeholder="e.g. AAPL, MSFT..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
      {searching && (
        <p className="text-sm text-text-tertiary">Searching...</p>
      )}
      {searchUnavailable && !searching && value.length > 0 && (
        <p className="text-sm text-text-tertiary">
          Symbol search is currently unavailable. You can manually enter an
          instrument below.
        </p>
      )}
      {searchResults.length > 0 && (
        <div className="bg-bg-tertiary border border-border-primary rounded-md overflow-hidden">
          {searchResults.map((r) => (
            <button
              key={r.symbol}
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-bg-secondary transition-colors flex items-center gap-2"
              onClick={() => onChange(r.symbol)}
            >
              <span className="font-medium text-text-primary">
                {r.symbol}
              </span>
              <span className="text-sm text-text-secondary">{r.name}</span>
              <span className="text-xs text-text-tertiary ml-auto">
                {r.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
