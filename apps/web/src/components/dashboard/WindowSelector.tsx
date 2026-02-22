"use client";

import { PillToggle } from "@/components/ui/PillToggle";
import { WINDOW_OPTIONS, type WindowOption } from "@/lib/window-utils";

interface WindowSelectorProps {
  value: WindowOption;
  onChange: (value: WindowOption) => void;
  className?: string;
}

export function WindowSelector({ value, onChange, className }: WindowSelectorProps) {
  return (
    <PillToggle
      options={WINDOW_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as WindowOption)}
      className={className}
    />
  );
}
