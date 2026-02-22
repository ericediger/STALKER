import { cn } from "@/lib/cn";

interface BadgeProps {
  variant: "positive" | "negative" | "warning" | "info" | "neutral";
  size?: "sm" | "md";
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeProps["variant"], string> = {
  positive: "bg-accent-positive/15 text-accent-positive",
  negative: "bg-accent-negative/15 text-accent-negative",
  warning: "bg-accent-warning/15 text-accent-warning",
  info: "bg-accent-info/15 text-accent-info",
  neutral: "bg-bg-tertiary text-text-secondary",
};

const sizeClasses: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
};

export function Badge({
  variant,
  size = "sm",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full inline-flex items-center font-medium",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
