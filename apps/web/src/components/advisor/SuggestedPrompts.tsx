"use client";

const PROMPTS = [
  "Which positions are dragging my portfolio down this quarter?",
  "What would the realized gain be if I sold my oldest lots?",
  "Am I overexposed to any single holding?",
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4">
      <p className="text-text-secondary text-base text-center">
        Ask me anything about your portfolio.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="text-left bg-bg-tertiary border border-border-primary rounded-lg p-3 text-sm text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
