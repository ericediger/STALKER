import { Button } from "@/components/ui/Button";

interface AdvisorEmptyProps {
  hasHoldings: boolean;
}

const suggestedPrompts = [
  "Which positions are dragging my portfolio down?",
  "What would my realized gain be if I sold my oldest lots?",
  "Am I overexposed to any single holding?",
];

export function AdvisorEmpty({ hasHoldings }: AdvisorEmptyProps) {
  if (!hasHoldings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <p className="text-text-secondary text-lg text-center">
          Add some holdings first so the advisor has something to work with.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <p className="text-text-secondary text-lg text-center">
        Ask me anything about your portfolio.
      </p>
      <div className="flex flex-col gap-3">
        {suggestedPrompts.map((prompt) => (
          <Button
            key={prompt}
            variant="ghost"
            onClick={() => {
              // TODO: Wire to advisor in Session 8
            }}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}
