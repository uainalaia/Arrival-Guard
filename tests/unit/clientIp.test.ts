import { describe, expect, it } from "vitest";
import { clientIp } from "@/interfaces/http/route";

// Deuda de VC6: el límite por IP usa la IP que fija la plataforma (x-real-ip en Vercel, vía ipAddress() de
// @vercel/functions) antes que el primer valor de X-Forwarded-For, que un cliente puede anteponer fuera de Vercel.
const req = (headers: Record<string, string>) => new Request("http://localhost/api/health", { headers });

describe("IP del cliente para los límites de acceso", () => {
  it("prefiere la IP que fija la plataforma", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("sin ella, usa el primer valor de X-Forwarded-For y, sin cabeceras, 'local'", () => {
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(req({}))).toBe("local");
  });
});
