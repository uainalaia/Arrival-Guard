import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runMain } from "./lib/args";

// eval:deterministic (BUILD_PROMPT 16.1): escenarios N, O y S de nivel API y caso de uso, SIN IA, contra la rama dev de
// Neon. Corre las suites reales (integración, API y seguridad) con el reporte JSON de Vitest y extrae cada escenario
// por su id en el nombre de la prueba. Nada se escribe a mano: el archivo de resultados sale de esa corrida.
// Salida: docs/results/deterministic-<timestamp>.json

const ID = /\b(N\d{2}|O\d{2}[ab]?|S\d{2})\b/g;
// Un describe cuyo título EMPIEZA con un id ("N01: …") es ese escenario; las pruebas sin id propio lo heredan.
const LEADING_ID = /^(N\d{2}|O\d{2}[ab]?|S\d{2}):/;

interface AssertionResult {
  readonly fullName: string;
  readonly title: string;
  readonly ancestorTitles?: readonly string[];
  readonly status: string;
  readonly duration?: number;
}
interface FileResult {
  readonly name: string;
  readonly assertionResults: readonly AssertionResult[];
}

runMain(async () => {
  const root = process.cwd();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const raw = path.join(root, "tmp", `vitest-deterministic-${stamp}.json`);
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "src", "tests", "scripts"], { encoding: "utf8" }).trim().length > 0;
  const started = Date.now();
  console.log(`eval:deterministic: commit ${commit}${dirty ? " (con cambios sin commit en src, tests o scripts)" : ""}`);
  const run = spawnSync("pnpm", ["exec", "vitest", "run", "--project", "integration", "--reporter=json", `--outputFile=${raw}`], { stdio: ["ignore", "ignore", "inherit"], shell: true });
  if (!fs.existsSync(raw)) {
    console.log("eval:deterministic: Vitest no produjo el reporte");
    return 1;
  }
  const report = JSON.parse(fs.readFileSync(raw, "utf8")) as { numTotalTests: number; numPassedTests: number; numFailedTests: number; testResults: readonly FileResult[] };
  const scenarios = new Map<string, { id: string; tests: { test: string; file: string; status: string; durationMs: number }[] }>();
  for (const file of report.testResults) {
    for (const a of file.assertionResults) {
      const own = a.title.match(ID) ?? [];
      const inherited = (a.ancestorTitles ?? []).map((t) => LEADING_ID.exec(t)?.[1]).filter((id): id is string => Boolean(id));
      for (const id of new Set(own.length > 0 ? own : inherited)) {
        const entry = scenarios.get(id) ?? { id, tests: [] };
        entry.tests.push({ test: a.fullName, file: path.relative(root, file.name).replace(/\\/g, "/"), status: a.status, durationMs: Math.round(a.duration ?? 0) });
        scenarios.set(id, entry);
      }
    }
  }
  const order = (id: string) => `${"NOS".indexOf(id[0]!)}${id.slice(1).padStart(4, "0")}`;
  const rows = [...scenarios.values()]
    .sort((a, b) => order(a.id).localeCompare(order(b.id)))
    .map((s) => ({ id: s.id, passed: s.tests.every((t) => t.status === "passed"), tests: s.tests }));
  const result = {
    kind: "deterministic",
    generatedAt: new Date().toISOString(),
    commit,
    uncommittedChanges: dirty,
    command: "pnpm exec vitest run --project integration",
    database: "Neon dev branch",
    ai: "none",
    durationSeconds: Math.round((Date.now() - started) / 1000),
    totals: { tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests },
    scenarios: rows,
  };
  const out = path.join(root, "docs", "results", `deterministic-${stamp}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  fs.rmSync(raw, { force: true });
  const failed = rows.filter((r) => !r.passed).map((r) => r.id);
  console.log(`escenarios: ${rows.length} (${rows.map((r) => r.id).join(", ")})`);
  console.log(`pruebas: ${report.numPassedTests} de ${report.numTotalTests} en verde; escenarios en rojo: ${failed.length ? failed.join(", ") : "ninguno"}`);
  console.log(`resultado: ${path.relative(root, out)}`);
  return run.status === 0 && failed.length === 0 ? 0 : 1;
});
