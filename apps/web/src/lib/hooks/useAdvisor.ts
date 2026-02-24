"use client";

import { useState, useCallback } from "react";

export interface AdvisorMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolName?: string;
  createdAt: string;
}

export interface AdvisorThread {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AdvisorState {
  threads: AdvisorThread[];
  activeThreadId: string | null;
  messages: AdvisorMessage[];
  isLoading: boolean;
  error: string | null;
  isSetupRequired: boolean;
}

export function useAdvisor() {
  const [state, setState] = useState<AdvisorState>({
    threads: [],
    activeThreadId: null,
    messages: [],
    isLoading: false,
    error: null,
    isSetupRequired: false,
  });

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    const userMessage: AdvisorMessage = {
      id: tempId,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: state.activeThreadId,
          message: trimmed,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { code?: string; message?: string };
        if (body.code === "LLM_NOT_CONFIGURED") {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isSetupRequired: true,
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: body.message ?? "Something went wrong. Please try again.",
        }));
        return;
      }

      const data = (await res.json()) as {
        threadId: string;
        messages: AdvisorMessage[];
      };

      setState((prev) => ({
        ...prev,
        activeThreadId: data.threadId,
        messages: [...prev.messages, ...data.messages],
        isLoading: false,
        error: null,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Network error. Please check your connection.",
      }));
    }
  }, [state.activeThreadId]);

  const loadThreads = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/advisor/threads");
      if (!res.ok) return;
      const data = (await res.json()) as { threads: AdvisorThread[] };
      setState((prev) => ({ ...prev, threads: data.threads }));
    } catch {
      // Silently fail — thread list is not critical
    }
  }, []);

  const loadThread = useCallback(async (threadId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/advisor/threads/${threadId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        id: string;
        messages: AdvisorMessage[];
      };
      setState((prev) => ({
        ...prev,
        activeThreadId: data.id,
        messages: data.messages,
        error: null,
      }));
    } catch {
      // Silently fail
    }
  }, []);

  const newThread = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeThreadId: null,
      messages: [],
      error: null,
      isSetupRequired: false,
    }));
  }, []);

  const deleteThread = useCallback(async (threadId: string): Promise<void> => {
    try {
      await fetch(`/api/advisor/threads/${threadId}`, { method: "DELETE" });
      setState((prev) => ({
        ...prev,
        threads: prev.threads.filter((t) => t.id !== threadId),
        ...(prev.activeThreadId === threadId
          ? { activeThreadId: null, messages: [] }
          : {}),
      }));
    } catch {
      // Silently fail
    }
  }, []);

  return {
    ...state,
    sendMessage,
    loadThreads,
    loadThread,
    newThread,
    deleteThread,
  };
}
