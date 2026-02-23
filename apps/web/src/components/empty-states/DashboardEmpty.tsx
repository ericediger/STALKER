"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";

export function DashboardEmpty() {
  const [showAddInstrument, setShowAddInstrument] = useState(false);

  const handleSuccess = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <p className="text-text-secondary text-lg text-center">
        Add your first holding to start tracking your portfolio.
      </p>
      <Button
        variant="primary"
        onClick={() => setShowAddInstrument(true)}
      >
        Add Instrument
      </Button>
      <AddInstrumentModal
        open={showAddInstrument}
        onClose={() => setShowAddInstrument(false)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
