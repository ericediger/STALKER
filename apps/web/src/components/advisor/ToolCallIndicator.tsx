"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const TOOL_LABELS: Record<string, string> = {
  getPortfolioSnapshot: "Looking up portfolio summary...",
  getHolding: "Looking up position details...",
  getTransactions: "Checking transaction history...",
  getQuotes: "Checking current prices...",
};

interface ToolCallIndicatorProps {
  toolName?: string;
  content: string;
}

export function ToolCallIndicator({ toolName, content }: ToolCallIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const label = toolName ? (TOOL_LABELS[toolName] ?? `Running ${toolName}...`) : "Running tool...";

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className={cn(
        "w-full text-left bg-bg-tertiary border border-border-primary rounded-lg p-2",
        "hover:bg-bg-secondary transition-colors cursor-pointer",
      )}
    >
      <div className="flex items-center gap-2 text-text-tertiary text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 shrink-0"
        >
          <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
        </svg>
        <span>{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={cn("w-3 h-3 ml-auto transition-transform", expanded && "rotate-180")}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      {expanded && (
        <pre className="mt-2 text-xs text-text-tertiary font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
          {content.length > 500 ? content.slice(0, 500) + "..." : content}
        </pre>
      )}
    </button>
  );
}
