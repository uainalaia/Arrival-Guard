import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Token de sesión de 256 bits, en base64url. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC-SHA256 con el pepper del servidor: lo único que se guarda de un token o de una IP. */
export function pepperedHash(pepper: string, purpose: string, value: string): string {
  return createHmac("sha256", pepper).update(`${purpose}:${value}`, "utf8").digest("hex");
}

/** Comparación en tiempo constante de dos textos (vía sus HMAC, que tienen el mismo largo). */
export function constantTimeEquals(pepper: string, a: string, b: string): boolean {
  const ha = createHmac("sha256", pepper).update(a, "utf8").digest();
  const hb = createHmac("sha256", pepper).update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
