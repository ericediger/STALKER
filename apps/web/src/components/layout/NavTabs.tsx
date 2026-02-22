"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface NavTab {
  label: string;
  href: string;
}

const tabs: NavTab[] = [
  { label: "Dashboard", href: "/" },
  { label: "Holdings", href: "/holdings" },
  { label: "Transactions", href: "/transactions" },
  { label: "Charts", href: "/charts" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-6 px-page border-b border-border-primary bg-bg-primary">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "py-3 text-base font-body font-medium transition-colors",
              isActive
                ? "text-text-primary border-b-2 border-accent-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
