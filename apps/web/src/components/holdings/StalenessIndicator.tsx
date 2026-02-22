"use client";

import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatRelativeTime, formatDate } from "@/lib/format";

interface StalenessIndicatorProps {
  lastUpdated: string;
}

export function StalenessIndicator({ lastUpdated }: StalenessIndicatorProps) {
  return (
    <Tooltip content={`Last updated: ${formatDate(lastUpdated)}`} side="top">
      <Badge variant="warning" size="sm">
        {formatRelativeTime(lastUpdated)}
      </Badge>
    </Tooltip>
  );
}
