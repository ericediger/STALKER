import { cn } from "@/lib/cn";

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <div
      className={cn("bg-bg-tertiary animate-pulse rounded", className)}
      style={{
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      }}
      aria-hidden="true"
    />
  );
}
