import { ChevronDown } from "lucide-react";
import { Children, cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { StopOctagon } from "@/ui/brand/StopOctagon";
import { cn } from "@/ui/lib/cn";

const CONTROL =
  "h-10 w-full rounded-control border bg-surface px-3 text-[15px] text-ink placeholder:text-muted pointer-coarse:h-11 " +
  "transition-colors duration-fast hover:border-ink disabled:cursor-not-allowed disabled:border-line disabled:text-muted " +
  "read-only:border-line read-only:bg-paper read-only:hover:border-line";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

const isInvalid = (flag: boolean, aria: InputHTMLAttributes<HTMLElement>["aria-invalid"]) => flag || aria === true || aria === "true";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid = false, className, "aria-invalid": ariaInvalid, ...rest }, ref) {
  const bad = isInvalid(invalid, ariaInvalid);
  return (
    <input
      ref={ref}
      aria-invalid={bad || undefined}
      className={cn(CONTROL, "tabular", bad ? "border-stop hover:border-stop" : "border-line-strong", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean;
}

/** `<select>` nativo con el estilo de los campos: accesible sin trabajo extra. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid = false, className, children, "aria-invalid": ariaInvalid, ...rest }, ref) {
  const bad = isInvalid(invalid, ariaInvalid);
  return (
    <span className="relative block">
      <select
        ref={ref}
        aria-invalid={bad || undefined}
        className={cn(CONTROL, "appearance-none pr-10", bad ? "border-stop" : "border-line-strong", className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown aria-hidden strokeWidth={1.75} className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
    </span>
  );
});

export interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: ReactNode;
  readonly error?: string | null;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Rótulo arriba, ayuda o error abajo (DESIGN_PLAN 6.4). Conecta `aria-describedby` y `aria-invalid` del control. */
export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const control = Children.only(children);
  const wired = isValidElement(control)
    ? cloneElement(control as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : control;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold leading-[18px] tracking-[0.005em] text-ink">
        {label}
      </label>
      {wired}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex animate-ag-fade-in items-center gap-1.5 text-[12px] font-medium leading-4 text-stop">
          <StopOctagon size={12} variant="outline" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[12px] font-medium leading-4 tracking-[0.01em] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
