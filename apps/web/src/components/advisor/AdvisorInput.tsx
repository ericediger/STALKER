"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";

interface AdvisorInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function AdvisorInput({ onSend, isLoading, disabled }: AdvisorInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max ~4 lines (4 * 20px line height + padding)
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, []);

  return (
    <div className="border-t border-border-primary bg-bg-secondary p-3 shrink-0">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message about your portfolio..."
          disabled={isLoading || disabled}
          rows={1}
          className={cn(
            "flex-1 bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2",
            "text-sm text-text-primary placeholder:text-text-tertiary",
            "resize-none focus:outline-none focus:border-accent-primary",
            "disabled:opacity-50",
          )}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading || disabled}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            "bg-accent-primary text-bg-primary",
            "hover:brightness-110 transition-all",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
          aria-label="Send message"
        >
          {isLoading ? (
            <svg
              className="w-4 h-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
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
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
