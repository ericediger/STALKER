"use client";

import { useState, useCallback } from "react";
import { NavTabs } from "@/components/layout/NavTabs";
import { DataHealthFooter } from "@/components/layout/DataHealthFooter";
import { AdvisorFAB } from "@/components/layout/AdvisorFAB";
import { AdvisorPanel } from "@/components/advisor/AdvisorPanel";
import { ToastProvider } from "@/components/ui/Toast";

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const [advisorOpen, setAdvisorOpen] = useState(false);

  const openAdvisor = useCallback(() => setAdvisorOpen(true), []);
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);

  return (
    <ToastProvider>
      <NavTabs />
      <main className="min-h-screen pt-0 pb-12 px-page">
        {children}
      </main>
      <DataHealthFooter />
      <AdvisorFAB onClick={openAdvisor} />
      <AdvisorPanel open={advisorOpen} onClose={closeAdvisor} />
    </ToastProvider>
  );
}
