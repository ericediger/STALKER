"use client";

import { cn } from "@/lib/cn";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-bg-secondary border border-border-primary rounded-lg p-card",
        className,
      )}
    >
      {title && (
        <h3 className="font-heading text-lg text-text-primary mb-3">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
