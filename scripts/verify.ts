import { spawnSync } from "node:child_process";

// pnpm verify (AUTONOMIA 5): typecheck, lint, test, db:seed-check, build y, desde la Fase 7, secrets-scan.
const steps = ["typecheck", "lint", "test", "db:seed-check", "build", "secrets-scan"];

const results: { step: string; ok: boolean; seconds: number }[] = [];
for (const step of steps) {
  console.log(`\n=== verify: ${step}`);
  const started = Date.now();
  const run = spawnSync("pnpm", ["run", step], { stdio: "inherit", shell: true });
  const ok = run.status === 0;
  results.push({ step, ok, seconds: Math.round((Date.now() - started) / 1000) });
  if (!ok) break;
}

console.log("\n=== verify: resumen");
for (const r of results) console.log(`${r.ok ? "OK   " : "FALLA"} ${r.step} (${r.seconds} s)`);
const skipped = steps.slice(results.length);
for (const step of skipped) console.log(`---   ${step} (no se corrió)`);
const allOk = results.length === steps.length && results.every((r) => r.ok);
console.log(allOk ? "verify: TODO EN VERDE" : "verify: EN ROJO");
process.exitCode = allOk ? 0 : 1;
