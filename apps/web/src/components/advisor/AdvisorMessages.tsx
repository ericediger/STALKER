"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { AdvisorMessage } from "@/lib/hooks/useAdvisor";
import { ToolCallIndicator } from "./ToolCallIndicator";

interface AdvisorMessagesProps {
  messages: AdvisorMessage[];
  isLoading: boolean;
  hasSummary?: boolean;
}

export function AdvisorMessages({ messages, isLoading, hasSummary }: AdvisorMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {hasSummary && (
        <div className="mx-0 mt-1 mb-2 flex items-center gap-2 rounded-md bg-bg-tertiary px-3 py-2 text-xs text-text-tertiary">
          <svg
            className="h-3.5 w-3.5 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
            />
          </svg>
          <span>Older messages have been summarized to maintain conversation quality.</span>
        </div>
      )}
      {messages.map((msg) => {
        if (msg.role === "tool") {
          return (
            <div key={msg.id} className="max-w-[90%]">
              <ToolCallIndicator toolName={msg.toolName} content={msg.content} />
            </div>
          );
        }

        if (msg.role === "user") {
          return (
            <div key={msg.id} className="flex justify-end">
              <div
                className={cn(
                  "max-w-[85%] rounded-lg p-3",
                  "bg-accent-primary/15 text-text-primary",
                  "text-sm whitespace-pre-wrap",
                )}
              >
                {msg.content}
              </div>
            </div>
          );
        }

        // assistant
        return (
          <div key={msg.id} className="max-w-[90%]">
            <div
              className={cn(
                "rounded-lg p-3",
                "bg-bg-tertiary border border-border-primary",
                "text-sm text-text-primary whitespace-pre-wrap",
              )}
            >
              {msg.content}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="max-w-[90%]">
          <div className="rounded-lg p-3 bg-bg-tertiary border border-border-primary">
            <div className="flex items-center gap-2 text-text-tertiary text-sm" role="status" aria-label="Loading">
              <svg
                className="w-4 h-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Thinking...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
