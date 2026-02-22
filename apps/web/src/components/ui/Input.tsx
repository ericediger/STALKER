"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  className,
  id: externalId,
  ...props
}: InputProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-text-primary",
          "placeholder:text-text-tertiary",
          "focus:border-accent-primary focus:ring-1 focus:ring-accent-primary focus:outline-none",
          "transition-colors",
          error && "border-accent-negative focus:border-accent-negative focus:ring-accent-negative",
          className,
        )}
        {...props}
      />
      {error && (
        <p className="text-sm text-accent-negative">{error}</p>
      )}
      {hint && !error && (
        <p className="text-sm text-text-tertiary">{hint}</p>
      )}
    </div>
  );
}
