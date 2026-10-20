"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/ui/lib/motion";

/**
 * Anclas de la landing (#how, #for-judges...): al pulsarlas, la página se desplaza suave hasta la sección (UI_UX 8) y
 * el foco pasa a ella. Solo los clics en esas anclas: el resto de la aplicación se desplaza al instante, y con
 * movimiento reducido también estas.
 */
export function AnchorScroll() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
      const id = link?.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      window.history.pushState(null, "", `#${id}`);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
