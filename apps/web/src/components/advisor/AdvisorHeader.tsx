"use client";

import { cn } from "@/lib/cn";

interface AdvisorHeaderProps {
  onNewThread: () => void;
  onToggleThreads: () => void;
  onClose: () => void;
  showingThreads: boolean;
}

export function AdvisorHeader({
  onNewThread,
  onToggleThreads,
  onClose,
  showingThreads,
}: AdvisorHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary shrink-0">
      <h2 className="font-heading text-lg text-text-primary font-semibold">
        Advisor
      </h2>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewThread}
          className="px-2 py-1 text-xs rounded bg-accent-primary text-bg-primary hover:brightness-110 transition-all"
        >
          New
        </button>
        <button
          type="button"
          onClick={onToggleThreads}
          className={cn(
            "px-2 py-1 text-xs rounded transition-colors",
            showingThreads
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary",
          )}
        >
          Threads
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-secondary transition-colors p-1 ml-1"
          aria-label="Close advisor"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
