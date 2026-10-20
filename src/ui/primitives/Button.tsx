import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/ui/lib/cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "secondary" | "quiet" | "danger";
  /** Deshabilita, marca `aria-busy` y muestra el spinner con `loadingText` (por ejemplo "Sending"). */
  readonly loading?: boolean;
  readonly loadingText?: string;
  readonly size?: "md" | "sm";
  readonly fullWidth?: boolean;
}

const VARIANTS = {
  primary: "bg-route text-on-route hover:bg-route-hover disabled:bg-line disabled:text-muted",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-paper disabled:border-line disabled:bg-surface disabled:text-muted",
  quiet: "bg-transparent text-route hover:bg-route-tint disabled:bg-transparent disabled:text-muted",
  // Solo para revocar una aprobación o un permiso (UI_UX 12).
  danger: "border border-stop bg-surface text-stop hover:bg-stop-tint disabled:border-line disabled:bg-surface disabled:text-muted",
} as const;

/** Botón de UI_UX 12: 40 px (44 en táctil), Overpass 600 a 15 px, sin flechas en el texto. Un primario por zona. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, loadingText, size = "md", fullWidth = false, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold leading-none",
        "transition-colors duration-fast ease-standard disabled:cursor-not-allowed",
        size === "md" ? "h-10 px-4 text-[15px] pointer-coarse:h-11" : "h-9 px-3 text-[14px] pointer-coarse:h-11",
        variant === "quiet" && size === "md" && "px-3",
        VARIANTS[variant],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" strokeWidth={1.75} /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});
