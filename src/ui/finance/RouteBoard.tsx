import type { RouteEvaluationDTO, RoutingDTO } from "@/application/dto/CaseDTO";
import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { formatClock } from "@/ui/format/time";
import { cn } from "@/ui/lib/cn";
import { Button } from "@/ui/primitives/Button";
import { channelName } from "./channels";
import { MoneyFigure } from "./MoneyFigure";
import { reasonCopy, type ReasonCopy } from "./reasons";
import { StatusPill } from "./StatusPill";

export interface RouteBoardProps {
  readonly routing: RoutingDTO;
  readonly targetHours: number;
  readonly invoiceNet: MoneyDTO;
  readonly comparedAt?: string | null;
  /** Tras enviar, el tablero se compacta a la fila elegida. */
  readonly compact?: boolean;
  readonly onToggleCompact?: () => void;
  readonly payerName?: string;
  readonly className?: string;
}

type Kind = "selected" | "viable" | "discarded";

interface Row {
  readonly route: RouteEvaluationDTO;
  readonly kind: Kind;
  readonly status: { readonly title: string; readonly detail: string | null; readonly also: readonly string[] };
}

/**
 * Titular cuando no hay ruta elegida (VC7): sale de los bloqueos del plan o de la razón que comparten todas las rutas;
 * "No route arrives in time" solo si de verdad todas fallan por plazo.
 */
export function noRouteHeadline(routing: RoutingDTO, targetHours: number, fastest: RouteEvaluationDTO | null, invoiceNet: MoneyDTO, payerName?: string): { title: string; detail: string } {
  if (routing.blockers.length > 0) return reasonCopy(routing.blockers[0]!, { targetHours, invoiceNet, payerName });
  const all = [...routing.viable, ...routing.discarded];
  const shared = all.length > 0 ? all[0]!.reasons.find((code) => all.every((r) => r.reasons.includes(code))) : undefined;
  if (shared && shared !== "DEADLINE_MISSED") return reasonCopy(shared, { targetHours, invoiceNet, payerName });
  if (shared === "DEADLINE_MISSED" && fastest) return { title: "No route arrives in time", detail: `The fastest route takes ${fastest.arrivalHours} h. You need it within ${targetHours} h.` };
  return { title: "No route meets every rule", detail: "Each route fails at least one rule. The reasons are listed on each row." };
}

/**
 * Tablero de rutas con aspecto de tablero de llegadas (UI_UX 12): primero la elegida, después las viables y al final
 * las descartadas con la razón en la fila, nunca en un tooltip.
 */
export function RouteBoard({ routing, targetHours, invoiceNet, comparedAt, compact = false, onToggleCompact, payerName, className }: RouteBoardProps) {
  const rows = buildRows(routing, targetHours, invoiceNet, payerName);
  const visible = compact ? rows.filter((r) => r.kind === "selected") : rows;
  const noRoute = routing.selectedRouteId === null;
  const fastest = [...routing.viable, ...routing.discarded].reduce<RouteEvaluationDTO | null>((best, r) => (best === null || r.arrivalHours < best.arrivalHours ? r : best), null);
  const headline = noRouteHeadline(routing, targetHours, fastest, invoiceNet, payerName);
  const note = `Within ${targetHours} h${comparedAt ? `, compared at ${formatClock(comparedAt)} virtual time` : ""}`;
  // Al pulsar "Show all routes", las filas que se suman entran con un fundido (UI_UX 8); nada anima al montar.
  const revealed = (row: Row) => onToggleCompact !== undefined && !compact && row.kind !== "selected" && "animate-ag-fade-in-base";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium leading-4 tracking-[0.01em] text-muted">{note}</p>
        {onToggleCompact && !noRoute ? (
          <Button variant="quiet" size="sm" onClick={onToggleCompact}>
            {compact ? "Show all routes" : "Show selected only"}
          </Button>
        ) : null}
      </div>

      {noRoute ? (
        <div className="rounded-doc border border-line bg-paper px-4 py-3">
          <p className="text-[15px] font-semibold leading-[22px] text-ink">{headline.title}</p>
          <p className="text-[14px] leading-[22px] text-ink-2">{headline.detail}</p>
        </div>
      ) : null}

      {/* Escritorio y tableta: tabla con caption y encabezados. */}
      <table className="hidden w-full border-collapse text-left md:table">
        <caption className="sr-only">Routes for this tuition payment. {note}.</caption>
        <thead>
          <tr className="border-b border-line text-[13px] font-semibold leading-[18px] tracking-[0.005em] text-ink-2">
            <th scope="col" className="py-2 pl-4 pr-3 font-semibold">
              Route
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Arrives in
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              University receives
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Costs
            </th>
            <th scope="col" className="py-2 pl-3 pr-2 font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.route.routeId} className={cn("border-b border-line align-top last:border-b-0", revealed(row))}>
              <td className={cn("border-l-[3px] py-3 pl-[13px] pr-3", row.kind === "selected" ? "border-l-route" : "border-l-transparent")}>
                <RouteName row={row} />
              </td>
              <td className={cn("tabular px-3 py-3 text-right text-[14px] leading-[22px]", row.kind === "discarded" ? "text-ink-2" : "text-ink")}>{row.route.arrivalHours} h</td>
              <td className="px-3 py-3 text-right">
                <MoneyFigure money={row.route.net} size="s" className={row.kind === "discarded" ? "text-ink-2" : undefined} />
              </td>
              <td className="px-3 py-3 text-right">
                <MoneyFigure money={row.route.debit} size="s" className={row.kind === "discarded" ? "text-ink-2" : undefined} />
              </td>
              <td className="py-3 pl-3 pr-2">
                <RouteStatus row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Móvil: filas apiladas, con las mismas razones visibles. */}
      <ul className="flex flex-col md:hidden" aria-label="Routes for this tuition payment">
        {visible.map((row) => (
          <li key={row.route.routeId} className={cn("border-b border-l-[3px] border-b-line py-3 pl-3 pr-1 last:border-b-0", row.kind === "selected" ? "border-l-route" : "border-l-transparent", revealed(row))}>
            <div className="flex items-start justify-between gap-3">
              <RouteName row={row} />
              <MoneyFigure money={row.route.debit} size="s" className={row.kind === "discarded" ? "text-ink-2" : undefined} />
            </div>
            <p className={cn("tabular mt-1 text-[14px] leading-[22px]", row.kind === "discarded" ? "text-ink-2" : "text-ink")}>
              Arrives in {row.route.arrivalHours} h. University receives <MoneyFigure money={row.route.net} size="s" className={row.kind === "discarded" ? "text-ink-2" : undefined} />
            </p>
            <div className="mt-2">
              <RouteStatus row={row} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RouteName({ row }: { row: Row }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-doc text-[15px] font-bold",
          row.kind === "selected" ? "bg-route text-on-route" : row.kind === "viable" ? "border border-ink text-ink" : "border border-line-strong text-ink-2",
        )}
      >
        {row.route.routeId}
      </span>
      <span className="flex flex-col">
        <span className="sr-only">Route {row.route.routeId}, </span>
        <span className={cn("text-[14px] font-semibold leading-5", row.kind === "discarded" ? "text-ink-2" : "text-ink")}>{channelName(row.route.channel)}</span>
      </span>
    </span>
  );
}

function RouteStatus({ row }: { row: Row }) {
  if (row.kind === "selected") {
    return (
      <span className="flex flex-col items-start gap-1">
        <StatusPill status="SELECTED" />
        {row.status.detail ? <span className="text-[14px] leading-[22px] text-ink-2">{row.status.detail}</span> : null}
      </span>
    );
  }
  if (row.kind === "viable") return <span className="text-[14px] font-semibold leading-[22px] text-ink">{row.status.title}</span>;
  return (
    <span className="flex flex-col">
      <span className="text-[14px] font-semibold leading-[22px] text-ink-2">{row.status.title}</span>
      {row.status.detail ? <span className="text-[14px] leading-[22px] text-ink-2">{row.status.detail}</span> : null}
      {row.status.also.length > 0 ? <span className="text-[12px] font-medium leading-4 text-muted">Also: {row.status.also.join(", ").toLowerCase()}.</span> : null}
    </span>
  );
}

function buildRows(routing: RoutingDTO, targetHours: number, invoiceNet: MoneyDTO, payerName?: string): Row[] {
  const selectedId = routing.selectedRouteId;
  const selected = routing.viable.find((r) => r.routeId === selectedId) ?? null;
  const others = routing.viable.filter((r) => r.routeId !== selectedId).sort((a, b) => compareMinor(a.debit, b.debit));
  const copyFor = (route: RouteEvaluationDTO, code: string): ReasonCopy =>
    reasonCopy(code, { routeHours: route.arrivalHours, targetHours, routeNet: route.net, invoiceNet, payerName });

  const rows: Row[] = [];
  if (selected) {
    const detail = others.length === 0 ? `The only route that arrives within ${targetHours} h` : "Lowest cost that meets every rule";
    rows.push({ route: selected, kind: "selected", status: { title: "Selected", detail, also: [] } });
  }
  for (const route of others) rows.push({ route, kind: "viable", status: { title: "Viable, costs more", detail: null, also: [] } });
  for (const route of routing.discarded) {
    const [first, ...rest] = route.reasons;
    const main = copyFor(route, first ?? "UNKNOWN");
    rows.push({ route, kind: "discarded", status: { title: main.title, detail: main.detail, also: rest.map((code) => copyFor(route, code).title) } });
  }
  return rows;
}

function compareMinor(a: MoneyDTO, b: MoneyDTO): number {
  const x = BigInt(a.minor);
  const y = BigInt(b.minor);
  return x < y ? -1 : x > y ? 1 : 0;
}
