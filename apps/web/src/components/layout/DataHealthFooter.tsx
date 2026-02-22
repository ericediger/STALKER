"use client";

// TODO: Wire to GET /api/market/status in Session 6

export function DataHealthFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-border-primary">
      <div className="text-text-tertiary text-xs py-2 px-page flex items-center gap-1.5">
        <span>15 instruments</span>
        <span className="select-none">&middot;</span>
        <span>Polling every 30 min</span>
        <span className="select-none">&middot;</span>
        <span>183 / 250 daily calls</span>
        <span className="select-none">&middot;</span>
        <span>All quotes updated within 35 min</span>
      </div>
    </footer>
  );
}
