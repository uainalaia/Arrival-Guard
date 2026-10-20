"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ActorRole } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { usePresence } from "@/ui/lib/motion";

// Control segmentado de rol (UI_UX 10 y DESIGN_PLAN 5.0): cambiar de rol conserva el espacio. Cada rol usa su
// propia cookie de sesión; el servidor decide qué puede hacer cada uno.

export interface RoleOption {
  readonly role: ActorRole;
  readonly name: string;
  readonly suffix: string;
  readonly initials: string;
  readonly pending?: boolean;
}

const AVATAR: Record<ActorRole, string> = {
  student: "bg-route-tint text-route",
  payer: "bg-surface text-ink border border-line-strong",
  evaluator: "bg-ink text-surface",
};

function Avatar({ option }: { option: RoleOption }) {
  return (
    <span className="relative inline-flex">
      <span aria-hidden className={cn("inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold", AVATAR[option.role])}>
        {option.initials}
      </span>
      {option.pending ? <span aria-hidden className="absolute -top-0.5 -right-0.5 size-[9px] rounded-full border-2 border-paper bg-wait" /> : null}
    </span>
  );
}

export function RoleSwitcher({ workspaceId, current, options }: { workspaceId: string; current: ActorRole; options: readonly RoleOption[] }) {
  const router = useRouter();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Menú móvil: aparece desde su esquina en `fast` y sale con la curva de salida (UI_UX 8); mientras sale queda inerte.
  const menu = usePresence(menuOpen, 120);
  const mobile = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // El menú móvil se cierra con Escape (el foco vuelve al botón) o al tocar fuera de él.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggle.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (mobile.current && !mobile.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);
  const go = (role: ActorRole) => {
    setMenuOpen(false);
    if (role !== current) router.push(`/w/${workspaceId}?as=${role}`);
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length;
    refs.current[next]?.focus();
  };
  const active = options.find((o) => o.role === current) ?? options[0]!;

  return (
    <>
      <div role="tablist" aria-label="View as" className="hidden items-center gap-1 rounded-control border border-line bg-paper p-1 md:flex">
        {options.map((option, index) => {
          const selected = option.role === current;
          return (
            <button
              key={option.role}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => onKey(e, index)}
              onClick={() => go(option.role)}
              aria-label={`${option.name}${option.suffix}${option.pending ? ", needs attention" : ""}`}
              className={cn(
                "flex h-10 items-center gap-2 rounded-[6px] px-3 text-[14px] transition-colors duration-fast",
                selected ? "border border-line-strong bg-surface font-semibold text-ink" : "border border-transparent text-ink-2 hover:text-ink",
              )}
            >
              <Avatar option={option} />
              <span>
                {option.name}
                <span className="font-normal text-muted">{option.suffix}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div ref={mobile} className="relative md:hidden">
        <button
          ref={toggle}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-11 items-center gap-2 rounded-control border border-line bg-paper px-2 text-[14px] font-semibold"
        >
          <Avatar option={active} />
          <span>{active.name}</span>
          <ChevronDown aria-hidden className={cn("size-4 text-ink-2 transition-transform duration-fast", menuOpen && "rotate-180")} strokeWidth={1.75} />
        </button>
        {menu.mounted ? (
          <div
            role="menu"
            onAnimationEnd={menu.onAnimationEnd}
            inert={menu.exiting || undefined}
            aria-hidden={menu.exiting || undefined}
            className={cn(
              "absolute top-12 right-0 z-30 w-52 origin-top-right rounded-control border border-line bg-surface p-1 shadow-float",
              menu.phase === "enter" && "animate-ag-scale-in",
              menu.exiting && "animate-ag-scale-out",
            )}
          >
            {options.map((option) => (
              <button
                key={option.role}
                role="menuitem"
                type="button"
                onClick={() => go(option.role)}
                className={cn("flex h-11 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[14px]", option.role === current ? "bg-route-tint font-semibold" : "hover:bg-paper")}
              >
                <Avatar option={option} />
                <span>
                  {option.name}
                  <span className="font-normal text-muted">{option.suffix}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
