import { NavTabs } from "@/components/layout/NavTabs";
import { DataHealthFooter } from "@/components/layout/DataHealthFooter";
import { AdvisorFAB } from "@/components/layout/AdvisorFAB";
import { ToastProvider } from "@/components/ui/Toast";

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <ToastProvider>
      <NavTabs />
      <main className="min-h-screen pt-0 pb-12 px-page">
        {children}
      </main>
      <DataHealthFooter />
      <AdvisorFAB />
    </ToastProvider>
  );
}
