import { DomainValidationError } from "../errors/DomainError";

/**
 * JSON canónico: claves ordenadas, sin espacios y solo tipos sin ambigüedad (string, entero, boolean, null,
 * arreglos y objetos planos). Rechaza bigint, decimales, undefined e instancias de clase para que nadie
 * meta dinero o fechas sin convertirlos antes de forma explícita (BUILD_PROMPT 8.4).
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, "$");
}

function serialize(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new DomainValidationError(`JSON canónico: ${path} debe ser un entero`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new DomainValidationError(`JSON canónico: tipo no admitido en ${path} (${typeof value})`);
  }
  if (Array.isArray(value)) return `[${value.map((item, i) => serialize(item, `${path}[${i}]`)).join(",")}]`;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new DomainValidationError(`JSON canónico: ${path} debe ser un objeto plano`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`)}`).join(",")}}`;
}
