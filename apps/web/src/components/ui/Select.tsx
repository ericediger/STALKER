"use client";

import { useId, useCallback } from "react";
import { cn } from "@/lib/cn";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Select({
  label,
  options,
  error,
  placeholder,
  value,
  onChange,
  className,
}: SelectProps) {
  const generatedId = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e.target.value);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={generatedId}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <select
        id={generatedId}
        value={value}
        onChange={handleChange}
        className={cn(
          "bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-text-primary",
          "focus:border-accent-primary focus:ring-1 focus:ring-accent-primary focus:outline-none",
          "transition-colors appearance-none",
          error && "border-accent-negative focus:border-accent-negative focus:ring-accent-negative",
          className,
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-accent-negative">{error}</p>
      )}
    </div>
  );
}
