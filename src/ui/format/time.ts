// Hora virtual en la interfaz (UI_UX 6.3): "Tue 20 Oct, 09:00" seguida de "virtual time". La hora virtual de los
// escenarios se guarda en UTC (2026-10-20T09:00:00Z es el inicio), así que se formatea en UTC, sin depender de la
// zona del navegador.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** "09:02" */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Tue 20 Oct" */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Tue 20 Oct, 09:00" */
export function formatVirtual(iso: string): string {
  return `${formatDay(iso)}, ${formatClock(iso)}`;
}

/** "09:02" si es el mismo día virtual que `reference`; si no, "Wed 21 Oct, 09:02". */
export function formatWhen(iso: string, reference: string | null): string {
  return reference && formatDay(iso) === formatDay(reference) ? formatClock(iso) : formatVirtual(iso);
}

/** Duración en minutos: "2 min", "6 h", "2 h 14 min". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Diferencia respecto al inicio del espacio: "+0 h", "+2 min", "+2 h 14 min". */
export function formatElapsed(totalMinutes: number): string {
  return totalMinutes <= 0 ? "+0 h" : `+${formatDuration(totalMinutes)}`;
}

/** Minutos de hora virtual entre dos instantes ISO (b menos a). */
export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

/** "24 h" para horas enteras de llegada. */
export function formatHours(hours: number): string {
  return `${hours} h`;
}
