import { Button } from "@/components/ui/Button";

export function DashboardEmpty() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <p className="text-text-secondary text-lg text-center">
        Add your first holding to start tracking your portfolio.
      </p>
      <Button
        variant="primary"
        onClick={() => {
          // TODO: Wire in Session 7
        }}
      >
        Add Instrument
      </Button>
    </div>
  );
}
