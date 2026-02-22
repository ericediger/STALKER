"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ToastOptions {
  message: string;
  variant?: "success" | "error" | "info";
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
  visible: boolean;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Variant styling                                                            */
/* -------------------------------------------------------------------------- */

const variantClasses: Record<NonNullable<ToastOptions["variant"]>, string> = {
  success: "border-accent-positive/40 text-accent-positive",
  error: "border-accent-negative/40 text-accent-negative",
  info: "border-accent-info/40 text-accent-info",
};

const variantIcons: Record<NonNullable<ToastOptions["variant"]>, string> = {
  success: "\u2713",
  error: "\u2717",
  info: "\u2139",
};

/* -------------------------------------------------------------------------- */
/*  Single Toast Item                                                          */
/* -------------------------------------------------------------------------- */

interface ToastItemProps {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}

function ToastItem({ entry, onDismiss }: ToastItemProps) {
  const variant = entry.variant ?? "info";

  return (
    <div
      className={cn(
        "bg-bg-secondary border rounded-lg px-4 py-3 shadow-lg",
        "flex items-center gap-3 min-w-[280px] max-w-[400px]",
        "transition-all duration-300 ease-in-out",
        entry.visible
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0",
        variantClasses[variant],
      )}
      role="alert"
    >
      <span className="text-lg font-bold shrink-0">
        {variantIcons[variant]}
      </span>
      <p className="text-text-primary text-sm flex-1">{entry.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(entry.id)}
        className="text-text-tertiary hover:text-text-secondary text-sm shrink-0"
        aria-label="Dismiss"
      >
        {"\u2715"}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Container                                                                  */
/* -------------------------------------------------------------------------- */

function ToastContainer({ entries, onDismiss }: {
  entries: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {entries.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    // Start slide-out animation
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, visible: false } : e)),
    );
    // Remove from DOM after animation
    setTimeout(() => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }, 300);
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      const duration = opts.duration ?? 4000;

      setEntries((prev) => [
        ...prev,
        { ...opts, id, visible: false },
      ]);

      // Trigger slide-in on next frame
      requestAnimationFrame(() => {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, visible: true } : e)),
        );
      });

      // Auto-dismiss
      setTimeout(() => {
        dismiss(id);
      }, duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer entries={entries} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
