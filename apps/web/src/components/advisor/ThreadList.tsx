"use client";

import { useEffect } from "react";
import type { AdvisorThread } from "@/lib/hooks/useAdvisor";
import { formatRelativeTime } from "@/lib/format";

interface ThreadListProps {
  threads: AdvisorThread[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onLoad: () => void;
}

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  onDelete,
  onLoad,
}: ThreadListProps) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

  if (threads.length === 0) {
    return (
      <div className="p-4 text-center text-text-tertiary text-sm">
        No previous conversations.
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto">
      {threads.map((thread) => (
        <div
          key={thread.id}
          className={`flex items-center gap-2 px-3 py-2 hover:bg-bg-tertiary transition-colors cursor-pointer ${
            thread.id === activeThreadId ? "bg-bg-tertiary" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect(thread.id)}
            className="flex-1 text-left min-w-0"
          >
            <div className="text-sm text-text-primary truncate">
              {thread.title}
            </div>
            <div className="text-xs text-text-tertiary">
              {formatRelativeTime(thread.updatedAt)} &middot; {thread.messageCount} messages
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(thread.id);
            }}
            className="text-text-tertiary hover:text-accent-negative transition-colors p-1 shrink-0"
            aria-label={`Delete thread: ${thread.title}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6.5a.75.75 0 01-1.49.12l-.5-6.5a.75.75 0 01.71-.84zm3.62.72a.75.75 0 00-1.49-.12l-.5 6.5a.75.75 0 001.49.12l.5-6.5z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
