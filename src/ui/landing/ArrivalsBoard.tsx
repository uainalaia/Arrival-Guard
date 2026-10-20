"use client";

import { useEffect, useRef, useState } from "react";
import { ConsentSeal } from "@/ui/brand";
import { MoneyFigure, StatusPill, type PillStatus } from "@/ui/finance";
import { cn } from "@/ui/lib/cn";
import { useReducedMotion } from "@/ui/lib/motion";

// Tablero de llegadas de la landing (UI_UX 11.1): guion en el cliente, sin llamadas a la API y con datos sintéticos
// rotulados. El servidor manda el primer paso; al quedar a la vista, el pago de Sofía recorre sus estaciones una sola
// vez en menos de 5 s y, al llegar a Credited, las letras del estado giran como un tablero (P2). Con movimiento
// reducido se ve directamente el estado final, igual que al imprimir.

const SAMPLE_SEAL = "b7710e2a5c3d9f8164a2e0b5c7d93f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e";

interface Step {
  readonly status: PillStatus;
  readonly time: string;
}

const STEPS: readonly Step[] = [
  { status: "WAITING_FOR_PAYER", time: "09:04" },
  { status: "APPROVED", time: "09:10" },
  { status: "PROVIDER_ACCEPTED", time: "09:13" },
  { status: "CREDITED", time: "11:14" },
];
const FINAL = STEPS.length - 1;
/** Momento de cada paso desde que el tablero queda a la vista (ms). El último termina antes de los 5 s. */
const SCHEDULE = [900, 2000, 3100] as const;

export function ArrivalsBoard({ showTransfer }: { showTransfer: boolean }) {
  const reduced = useReducedMotion();
  const [played, setPlayed] = useState(0);
  const board = useRef<HTMLElement | null>(null);
  const step = reduced ? FINAL : played;
  const current = STEPS[step]!;

  useEffect(() => {
    const node = board.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const timers: number[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        SCHEDULE.forEach((at, i) => timers.push(window.setTimeout(() => setPlayed(i + 1), at)));
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const live = !reduced;
  const reached = (n: number) => step >= n;

  return (
    <figure ref={board} aria-label="Example arrivals board with synthetic data" data-step={step} className="rounded-panel border border-line bg-surface p-5 md:p-6">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[20px] leading-[26px] font-[650]">Arrivals</span>
        <span key={current.time} className={cn("tabular text-[13px] text-muted", live && step > 0 && "animate-ag-fade-in")}>
          Tue 20 Oct, {current.time} virtual time
        </span>
      </figcaption>
      <table className="mt-4 w-full border-collapse text-left text-[14px] leading-[22px]">
        <thead className="text-[13px] text-muted">
          <tr>
            <th className="py-2 font-semibold">Payment</th>
            <th className="py-2 text-right font-semibold">Amount</th>
            {/* Ancho fijo para la píldora más larga: al cambiar de estado, el monto no se mueve. */}
            <th className="hidden w-60 py-2 pl-4 font-semibold md:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line align-top">
            <td className="pt-3 pb-2 md:pb-3">
              <span className="block font-semibold text-ink">AG-STUDENT-01</span>
              <span className="text-ink-2">Arrival University</span>
            </td>
            <td className="pt-3 pb-2 text-right md:pb-3">
              <MoneyFigure money={{ currency: "CNY", minor: "2000000" }} size="l" />
            </td>
            <td className="hidden py-3 pl-4 md:table-cell">
              <StatusPill status={current.status} flap={step === FINAL} />
            </td>
          </tr>
          {/* En móvil la columna de estado no cabe: la píldora va en su fila, bajo el nombre del pago, a todo el ancho. */}
          <tr className="md:hidden">
            <td colSpan={2} className="pb-3">
              <StatusPill status={current.status} flap={step === FINAL} />
            </td>
          </tr>
          {showTransfer ? (
            <tr className="border-t border-line align-top">
              <td className="pt-3 pb-2 md:pb-3">
                <span className="block font-semibold text-ink">Transfer to Sofía&apos;s local account</span>
                <span className="text-ink-2">Arrival Bank, account ending 7310</span>
              </td>
              <td className="pt-3 pb-2 text-right md:pb-3">
                <MoneyFigure money={{ currency: "CNY", minor: "200000" }} size="m" />
              </td>
              <td className="hidden py-3 pl-4 md:table-cell">
                <StatusPill status="DELIVERED" />
              </td>
            </tr>
          ) : null}
          {showTransfer ? (
            <tr className="md:hidden">
              <td colSpan={2} className="pb-3">
                <StatusPill status="DELIVERED" />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <ol className="mt-5 grid grid-cols-2 gap-4 rounded-doc bg-paper p-4 text-[13px] leading-[18px] md:grid-cols-4">
        <Station title="Lima" detail={reached(2) ? "USD 2,880.00 debited" : "USD 2,880.00 ready to send"} done animate={live && step === 2} />
        <li className="flex items-start gap-2">
          <ConsentSeal fingerprint={SAMPLE_SEAL} size={40} caption={false} state={reached(1) ? "stamped" : "placeholder"} animate={live && reached(1)} />
          <span>
            <span className={cn("block font-semibold", reached(1) ? "text-ink" : "text-muted")}>Approved</span>
            <span key={reached(1) ? "seal" : "waiting"} className={cn("text-ink-2", live && step === 1 && "animate-ag-fade-in-base")}>
              {reached(1) ? "Seal B771 0E2A" : "Waiting for Carlos"}
            </span>
          </span>
        </li>
        <Station title="Accepted" detail={reached(2) ? "Same payment, no duplicate" : "Not sent yet"} done={reached(2)} animate={live && step === 2} />
        <Station title="Shenzhen" detail={reached(3) ? "Credited, 11:14 virtual time" : "Waiting for the university"} done={reached(3)} arrive animate={live && step === 3} />
      </ol>
      <p className="mt-3 text-[12px] leading-4 text-muted">Example with synthetic data.</p>
    </figure>
  );
}

function Station({ title, detail, done, arrive = false, animate }: { title: string; detail: string; done: boolean; arrive?: boolean; animate: boolean }) {
  return (
    <li>
      <span className={cn("block font-semibold transition-colors duration-base", !done ? "text-muted" : arrive ? "text-arrive" : "text-ink")}>{title}</span>
      <span key={detail} className={cn("text-ink-2", animate && "animate-ag-fade-in-base")}>
        {detail}
      </span>
    </li>
  );
}
