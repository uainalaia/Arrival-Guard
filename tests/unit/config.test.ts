import { describe, expect, it } from "vitest";
import { getArg } from "../../scripts/lib/args";
import { resolveAppBaseUrl } from "@/infrastructure/config/env";
import { normalizeSslMode } from "@/infrastructure/db/connection";

describe("normalizeSslMode (DEC-006)", () => {
  it("convierte sslmode=require en verify-full y conserva los demás parámetros", () => {
    expect(normalizeSslMode("postgresql://u:p@h/db?sslmode=require&channel_binding=require")).toBe( // secrets-scan:allow (dato falso de prueba)
      "postgresql://u:p@h/db?sslmode=verify-full&channel_binding=require", // secrets-scan:allow (dato falso de prueba)
    );
    expect(normalizeSslMode("postgresql://u:p@h/db?channel_binding=require&sslmode=require")).toBe( // secrets-scan:allow (dato falso de prueba)
      "postgresql://u:p@h/db?channel_binding=require&sslmode=verify-full", // secrets-scan:allow (dato falso de prueba)
    );
  });

  it("no toca una cadena sin sslmode ni una que ya pide verify-full", () => {
    expect(normalizeSslMode("postgresql://u:p@h/db")).toBe("postgresql://u:p@h/db"); // secrets-scan:allow (dato falso de prueba)
    expect(normalizeSslMode("postgresql://u:p@h/db?sslmode=verify-full")).toBe("postgresql://u:p@h/db?sslmode=verify-full"); // secrets-scan:allow (dato falso de prueba)
  });
});

describe("resolveAppBaseUrl (DEC-002)", () => {
  it("usa APP_BASE_URL cuando existe, sin barra final", () => {
    expect(resolveAppBaseUrl({ APP_BASE_URL: "https://arrivalguard.vercel.app/" })).toBe("https://arrivalguard.vercel.app");
  });

  it("en un preview sin APP_BASE_URL usa la URL de la rama", () => {
    expect(
      resolveAppBaseUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "arrivalguard-git-dev-team.vercel.app", VERCEL_URL: "x.vercel.app" }),
    ).toBe("https://arrivalguard-git-dev-team.vercel.app");
  });

  it("en local cae a localhost", () => {
    expect(resolveAppBaseUrl({})).toBe("http://localhost:3000");
  });
});

describe("getArg", () => {
  it("lee --nombre valor y --nombre=valor", () => {
    expect(getArg("base-url", ["node", "x", "--base-url", "https://a.b"])).toBe("https://a.b");
    expect(getArg("code", ["node", "x", "--code=AG-1"])).toBe("AG-1");
    expect(getArg("missing", ["node", "x"])).toBeUndefined();
  });
});
