// Redacción de payloads de eventos y registros (BUILD_PROMPT 14.1): sin secretos y con cuentas enmascaradas.

const SECRET_KEY = /token|secret|password|passwd|api[_-]?key|authorization|cookie|pepper|connection|credential|access[_-]?code/i;
const SECRET_VALUE = /(sk-ant-[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/\S+|Bearer\s+[A-Za-z0-9._-]+)/g;
// Copia sin bandera g para .test() (una regex global guarda lastIndex entre llamadas).
const HAS_SECRET_VALUE = /(sk-ant-[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/\S+|Bearer\s+[A-Za-z0-9._-]+)/;
// 10 o más dígitos, con espacios o guiones entre ellos, AISLADOS: números de cuenta o tarjeta en texto libre.
// No toca fragmentos dentro de UUID, hashes u otros tokens alfanuméricos (VC4-4).
const LONG_NUMBER = /(?<![A-Za-z0-9-])\d(?:[\s-]?\d){9,}(?![A-Za-z0-9-])/g;
// Identificadores, huellas y claves: se conservan tal cual para que la bitácora correlacione.
const IDENTIFIER_KEY = /(^id$|Id$|Ids$|^ids$|fingerprint|Fingerprint|idempotencyKey|hash$|Hash$|^minor$|^seq$)/;

/** Enmascara un número largo dejando solo los 4 últimos dígitos. */
export function maskDigits(text: string): string {
  return text.replace(LONG_NUMBER, (match) => `•••• ${match.replace(/\D/g, "").slice(-4)}`);
}

export function redactString(text: string): string {
  return maskDigits(text.replace(SECRET_VALUE, "[redacted]"));
}

/** Copia profunda redactada. Identificadores, huellas y unidades menores de dinero no se enmascaran. */
export function redact<T>(value: T): T {
  return walk(value, "") as T;
}

function walk(value: unknown, key: string): unknown {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") return IDENTIFIER_KEY.test(key) && !HAS_SECRET_VALUE.test(value) ? value : redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => walk(item, key));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, k);
    return out;
  }
  return value;
}
