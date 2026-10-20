import { cn } from "@/ui/lib/cn";
import { SUGGESTIONS, type ChatRole } from "./labels";

/** Pedidos sugeridos por rol (UI_UX 9.6 y 12). Se muestran con el hilo vacío. */
export function SuggestionChips({ role, onPick, disabled = false, className }: { role: ChatRole; onPick: (text: string) => void; disabled?: boolean; className?: string }) {
  return (
    <div role="group" aria-label="Suggested requests" className={cn("flex flex-wrap gap-2", className)}>
      {SUGGESTIONS[role].map((text) => (
        <button
          key={text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(text)}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-left text-[14px] leading-5 text-ink transition-colors duration-fast hover:border-route hover:bg-route-tint disabled:cursor-not-allowed disabled:opacity-60"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
