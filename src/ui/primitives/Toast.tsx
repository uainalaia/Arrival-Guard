"use client";

import { BadgeCheck, Hourglass } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";

/** Avisos arriba a la derecha, bajo la banda (DESIGN_PLAN 5.0): `surface`, borde `line`, radio 8 y sombra flotante. */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      offset={{ top: 112, right: 32 }}
      mobileOffset={{ top: 96, right: 16, left: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex w-[min(360px,calc(100vw-32px))] items-center gap-3 rounded-control border border-line bg-surface px-4 py-3 text-[15px] font-semibold leading-5 text-ink shadow-float",
          title: "text-[15px] font-semibold leading-5",
          description: "text-[14px] font-normal leading-[22px] text-ink-2",
          icon: "shrink-0",
        },
      }}
    />
  );
}

/** Aviso de resultado con el nombre de la acción (UI_UX 9.3): "Payment approved", "Status updated". */
export function notify(text: string) {
  toast(text, { icon: <BadgeCheck aria-hidden className="size-5 text-arrive" strokeWidth={1.75} /> });
}

/** Aviso de espera: "Still waiting for the university". */
export function notifyWaiting(text: string) {
  toast(text, { icon: <Hourglass aria-hidden className="size-5 text-wait" strokeWidth={1.75} /> });
}
