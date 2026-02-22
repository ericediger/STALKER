"use client";

import { useCallback } from "react";
import { cn } from "@/lib/cn";

interface PillToggleOption {
  label: string;
  value: string;
}

interface PillToggleProps {
  options: PillToggleOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PillToggle({
  options,
  value,
  onChange,
  className,
}: PillToggleProps) {
  const handleClick = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        "bg-bg-tertiary rounded-full p-1 inline-flex",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleClick(option.value)}
            className={cn(
              "px-3 py-1 text-sm rounded-full transition-colors",
              isActive
                ? "bg-accent-primary text-bg-primary font-medium"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
