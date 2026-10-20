import { validateAllScenarios } from "../src/infrastructure/scenarios/validateScenario";
import { runMain } from "./lib/args";

// Valida la configuración de escenarios (BUILD_PROMPT 6 y 17): montos exactos, rutas y resultados de control del motor.
runMain(async () => {
  const checks = validateAllScenarios();
  let failed = false;
  for (const check of checks) {
    const status = check.errors.length === 0 ? "OK   " : "FALLA";
    console.log(`${status} ${check.scenario}${check.notes.length ? ` (${check.notes.join("; ")})` : ""}`);
    for (const error of check.errors) console.log(`      ${error}`);
    if (check.errors.length > 0) failed = true;
  }
  console.log(failed ? "db:seed-check: con errores" : `db:seed-check: ${checks.length} escenarios válidos`);
  return failed ? 1 : 0;
});
