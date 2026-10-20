import { describe, expect, it } from "vitest";
import { maskDigits, redact } from "@/infrastructure/security/redact";

describe("Redacción de payloads (BUILD_PROMPT 14.1)", () => {
  it("enmascara números de cuenta o tarjeta y deja solo los 4 últimos dígitos", () => {
    expect(maskDigits("send it to 6222 0201 8800 4471 now")).toBe("send it to •••• 4471 now");
    expect(maskDigits("account 6222020188004471")).toBe("account •••• 4471");
    expect(maskDigits("ref AG-STUDENT-01, 48 h")).toBe("ref AG-STUDENT-01, 48 h");
  });

  it("borra valores con forma de secreto y claves sensibles", () => {
    const out = redact({
      note: "key sk-ant-api03-abcdef and postgresql://u:p@host/db", // secrets-scan:allow (dato falso de prueba)
      sessionToken: "abc",
      authorization: "Bearer x",
      evalAccessCode: "AG-1234",
      nested: [{ password: "x", value: "ok" }],
    });
    expect(out).toEqual({
      note: "key [redacted] and [redacted]",
      sessionToken: "[redacted]",
      authorization: "[redacted]",
      evalAccessCode: "[redacted]",
      nested: [{ password: "[redacted]", value: "ok" }],
    });
  });

  it("no altera identificadores, huellas ni claves de idempotencia (VC4-4)", () => {
    const ids = {
      attemptId: "095d1e7d-43dd-4e35-8137-766298cdcd51",
      subjectId: "12345678-9012-4abc-8def-abcdefabcdef",
      fingerprint: "1234567890123456789012345678901234567890123456789012345678901234",
      idempotencyKey: "tuition:095d1e7d-43dd-4e35-8137-766298cdcd51:v1:12345678-9012-4abc-8def-abcdefabcdef",
      transferId: "tr_1234567890-1234-4abc-8def-1234567890ab",
      note: "plan 095d1e7d-43dd-4e35-8137-766298cdcd51 and card 6222 0201 8800 4471",
    };
    const out = redact(ids);
    expect(out.attemptId).toBe(ids.attemptId);
    expect(out.subjectId).toBe(ids.subjectId);
    expect(out.fingerprint).toBe(ids.fingerprint);
    expect(out.idempotencyKey).toBe(ids.idempotencyKey);
    expect(out.transferId).toBe(ids.transferId);
    expect(out.note).toBe("plan 095d1e7d-43dd-4e35-8137-766298cdcd51 and card •••• 4471");
  });

  it("un secreto dentro de un campo con nombre de identificador igual se borra", () => {
    expect(redact({ requestId: "sk-ant-api03-zzzz" })).toEqual({ requestId: "[redacted]" }); // secrets-scan:allow (dato falso de prueba)
  });

  it("no toca las unidades menores de dinero aunque sean números largos", () => {
    expect(redact({ debit: { currency: "USD", minor: "123456789012" } })).toEqual({ debit: { currency: "USD", minor: "123456789012" } });
  });
});
