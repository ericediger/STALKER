import { cn } from "@/lib/cn";

interface TooltipProps {
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  className?: string;
}

const sideClasses: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip({
  content,
  side = "top",
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn("relative inline-flex group", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "absolute z-50 pointer-events-none",
          "invisible opacity-0 group-hover:visible group-hover:opacity-100",
          "transition-opacity duration-150",
          "bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded",
          "border border-border-primary shadow-lg",
          "whitespace-nowrap",
          sideClasses[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
