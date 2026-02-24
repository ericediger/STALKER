"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { AdvisorHeader } from "./AdvisorHeader";
import { AdvisorMessages } from "./AdvisorMessages";
import { AdvisorInput } from "./AdvisorInput";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { ThreadList } from "./ThreadList";

interface AdvisorPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AdvisorPanel({ open, onClose }: AdvisorPanelProps) {
  const [showingThreads, setShowingThreads] = useState(false);
  const {
    threads,
    activeThreadId,
    messages,
    isLoading,
    error,
    isSetupRequired,
    sendMessage,
    loadThreads,
    loadThread,
    newThread,
    deleteThread,
  } = useAdvisor();

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleNewThread = useCallback(() => {
    newThread();
    setShowingThreads(false);
  }, [newThread]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      loadThread(threadId);
      setShowingThreads(false);
    },
    [loadThread],
  );

  const handleSend = useCallback(
    (text: string) => {
      setShowingThreads(false);
      sendMessage(text);
    },
    [sendMessage],
  );

  const hasMessages = messages.length > 0;
  const showSuggested = !hasMessages && !isSetupRequired;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-md z-50",
          "bg-bg-secondary shadow-2xl",
          "flex flex-col",
          "transform transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Portfolio Advisor"
        aria-hidden={!open}
      >
        <AdvisorHeader
          onNewThread={handleNewThread}
          onToggleThreads={() => setShowingThreads((prev) => !prev)}
          onClose={onClose}
          showingThreads={showingThreads}
        />

        {/* Thread list dropdown */}
        {showingThreads && (
          <div className="border-b border-border-primary bg-bg-secondary">
            <ThreadList
              threads={threads}
              activeThreadId={activeThreadId}
              onSelect={handleSelectThread}
              onDelete={deleteThread}
              onLoad={loadThreads}
            />
          </div>
        )}

        {/* Setup required state */}
        {isSetupRequired && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
            <h3 className="font-heading text-lg text-text-primary font-semibold">
              Advisor Setup Required
            </h3>
            <p className="text-text-secondary text-sm text-center">
              To use the portfolio advisor, add your LLM API key to{" "}
              <code className="font-mono text-accent-primary">.env.local</code>:
            </p>
            <pre className="font-mono text-xs bg-bg-tertiary rounded-lg p-3 w-full text-text-secondary">
{`LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here`}
            </pre>
            <p className="text-text-tertiary text-xs text-center">
              Then restart the development server.
            </p>
          </div>
        )}

        {/* Suggested prompts (empty thread) */}
        {!isSetupRequired && showSuggested && (
          <SuggestedPrompts onSelect={handleSend} />
        )}

        {/* Messages */}
        {!isSetupRequired && hasMessages && (
          <AdvisorMessages messages={messages} isLoading={isLoading} />
        )}

        {/* Error display */}
        {error && (
          <div className="px-4 pb-2">
            <div className="text-sm text-accent-negative bg-accent-negative/10 rounded-lg px-3 py-2">
              {error}
            </div>
          </div>
        )}

        {/* Input */}
        {!isSetupRequired && (
          <AdvisorInput
            onSend={handleSend}
            isLoading={isLoading}
          />
        )}
      </div>
    </>
  );
}
