"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/Input";

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
}

interface SymbolSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: SearchResult) => void;
  error?: string;
}

const MAX_RESULTS = 10;
const MIN_SEARCH_LENGTH = 3;

export function SymbolSearchInput({
  value,
  onChange,
  onSelect,
  error,
}: SymbolSearchInputProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't search if a result was just selected
    if (selectedSymbol === value) {
      return;
    }
    // Reset selected state when user types something different
    if (selectedSymbol !== null) {
      setSelectedSymbol(null);
    }

    if (!value || value.length < MIN_SEARCH_LENGTH) {
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
          results?: SearchResult[];
        };
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length === 0) {
          setSearchUnavailable(true);
        } else {
          setSearchUnavailable(false);
        }
        setSearchResults(results);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleSelect = (result: SearchResult) => {
    setSelectedSymbol(result.symbol);
    setSearchResults([]);
    setSearchUnavailable(false);
    onChange(result.symbol);
    onSelect(result);
  };

  const displayResults = searchResults.slice(0, MAX_RESULTS);

  return (
    <div className="space-y-2">
      <Input
        label="Search Symbol"
        type="text"
        placeholder="Type 3+ characters to search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
      {searching && (
        <p className="text-sm text-text-tertiary">Searching...</p>
      )}
      {value.length > 0 && value.length < MIN_SEARCH_LENGTH && !selectedSymbol && (
        <p className="text-sm text-text-tertiary">
          Type at least {MIN_SEARCH_LENGTH} characters to search...
        </p>
      )}
      {searchUnavailable && !searching && value.length >= MIN_SEARCH_LENGTH && (
        <p className="text-sm text-text-tertiary">
          No results found. You can manually enter the instrument below.
        </p>
      )}
      {displayResults.length > 0 && (
        <div className="bg-bg-tertiary border border-border-primary rounded-md overflow-hidden max-h-60 overflow-y-auto">
          {displayResults.map((r) => (
            <button
              key={r.symbol}
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-bg-secondary transition-colors flex items-center gap-2"
              onClick={() => handleSelect(r)}
            >
              <span className="font-medium text-text-primary">
                {r.symbol}
              </span>
              <span className="text-sm text-text-secondary truncate">{r.name}</span>
              <span className="text-xs text-text-tertiary ml-auto whitespace-nowrap">
                {r.exchange}
              </span>
            </button>
          ))}
          {searchResults.length > MAX_RESULTS && (
            <p className="px-3 py-1.5 text-xs text-text-tertiary border-t border-border-primary">
              Showing {MAX_RESULTS} of {searchResults.length} results. Refine your search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
