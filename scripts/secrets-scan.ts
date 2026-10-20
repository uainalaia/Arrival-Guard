import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { runMain } from "./lib/args";

// secrets-scan (BUILD_PROMPT 14.1): falla si un archivo del repositorio (código, docs/, exportaciones de evidencia y
// resultados) contiene algo con forma de clave, o el valor real de un secreto del entorno local. Nunca imprime el
// valor encontrado: solo archivo, línea y el nombre del patrón.

const PATTERNS: readonly { name: string; re: RegExp }[] = [
  { name: "clave de Anthropic (sk-ant-)", re: /sk-ant-[A-Za-z0-9_-]{12,}/ },
  { name: "cadena de conexión con credenciales", re: /postgres(?:ql)?:\/\/[^\s'"`:/]+:[^\s'"`@]+@/ },
  { name: "asignación de SESSION_PEPPER", re: /SESSION_PEPPER\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{16,}/ },
  { name: "asignación de ANTHROPIC_API_KEY", re: /ANTHROPIC_API_KEY\s*[=:]\s*['"]?[A-Za-z0-9_-]{16,}/ },
  { name: "asignación de EVAL_ACCESS_CODE", re: /EVAL_ACCESS_CODE\s*[=:]\s*['"]?[A-Za-z0-9_-]{8,}/ },
  { name: "asignación de DATABASE_URL", re: /DATABASE_URL(?:_UNPOOLED)?\s*[=:]\s*['"]?postgres/ },
  { name: "clave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

/** Valores reales del entorno local que nunca deben aparecer en un archivo versionado. */
const SECRET_ENV = ["ANTHROPIC_API_KEY", "SESSION_PEPPER", "EVAL_ACCESS_CODE", "DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz)$/i;

runMain(async () => {
  loadLocalEnv();
  const root = process.cwd();
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((f) => !BINARY.test(f) && fs.existsSync(path.join(root, f)));
  const values = SECRET_ENV.map((name) => ({ name, value: process.env[name] ?? "" })).filter((v) => v.value.length >= 8);
  const findings: string[] = [];
  for (const file of tracked) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      // Datos falsos de prueba marcados a mano en la misma línea: no son secretos (los valores reales se comparan igual).
      const allowed = line.includes("secrets-scan:allow");
      if (!allowed) for (const p of PATTERNS) if (p.re.test(line)) findings.push(`${file}:${i + 1}: ${p.name}`);
      for (const v of values) if (line.includes(v.value)) findings.push(`${file}:${i + 1}: valor real de ${v.name}`);
    });
  }
  console.log(`secrets-scan: ${tracked.length} archivos revisados (código, docs/ y exportaciones), ${values.length} valores del entorno comparados`);
  if (findings.length > 0) {
    for (const f of findings) console.log(`FALLA ${f}`);
    console.log(`secrets-scan: ${findings.length} hallazgos`);
    return 1;
  }
  console.log("secrets-scan: OK, sin secretos");
  return 0;
});
