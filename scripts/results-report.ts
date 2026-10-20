import fs from "node:fs";
import path from "node:path";
import { runMain } from "./lib/args";

// results:report (BUILD_PROMPT 16.1): arma docs/results/RESULTS.md y llena las secciones de resultados de
// docs/EVALUATION.md y docs/SECURITY_SELF_ASSESSMENT.md SOLO con los archivos reales de docs/results/ (el más reciente
// de cada tipo), citando commit, fecha, modelo, effort y número de ejecuciones. No escribe nada que no salga de esos
// archivos: si falta un tipo de corrida, su sección lo dice.

interface DeterministicFile {
  readonly kind: "deterministic";
  readonly generatedAt: string;
  readonly commit: string;
  readonly uncommittedChanges: boolean;
  readonly command: string;
  readonly database: string;
  readonly durationSeconds: number;
  readonly totals: { readonly tests: number; readonly passed: number; readonly failed: number };
  readonly scenarios: readonly { readonly id: string; readonly passed: boolean; readonly tests: readonly { readonly test: string; readonly file: string; readonly status: string }[] }[];
}
interface AgentFile {
  readonly kind: "agent";
  readonly generatedAt: string;
  readonly commit: string;
  readonly model: string;
  readonly effort: string;
  readonly thinking: string;
  readonly repeat: number;
  readonly database: string;
  readonly durationSeconds: number;
  readonly totals: { readonly scenarios: number; readonly passed: number; readonly failed: readonly string[] };
  readonly metrics: {
    readonly medianStudentTurnsToPrepareNormalCases: number | null;
    readonly normalCasesMeasured?: string;
    readonly unnecessaryQuestionsInCompleteRequests: number;
    readonly completeRequests: number;
    readonly correctionsPreservingValidData: string;
    readonly turns: number;
    readonly safeExitFallbacks: number;
    readonly medianTurnLatencyMs: number | null;
    readonly maxTurnLatencyMs: number | null;
    readonly totalCostUsdMicros: string;
  };
  readonly scenarios: readonly {
    readonly id: string;
    readonly group: string;
    readonly title: string;
    readonly run: number;
    readonly passed: boolean;
    readonly checks: readonly { readonly check: string; readonly ok: boolean }[];
    readonly studentTurns: number;
    readonly costUsdMicros: string;
    readonly error?: string;
  }[];
}
interface TasksFile {
  readonly kind: "tasks";
  readonly generatedAt: string;
  readonly baseUrl: string;
  readonly commit: string | null;
  readonly tasks: readonly { readonly id: string; readonly title: string; readonly type: string; readonly passed: boolean; readonly checks: readonly { readonly check: string; readonly ok: boolean }[]; readonly durationMs: number; readonly error?: string }[];
  readonly consoleRun?: ConsoleRun;
}
interface ConsoleRun {
  readonly status: number | null;
  readonly durationMs: number;
  readonly passed: number | null;
  readonly total: number | null;
  readonly tasks: readonly { readonly id: string; readonly passed: boolean; readonly error: string | null }[];
  readonly error?: string;
}

function consoleLine(run: ConsoleRun): string {
  const failing = run.tasks.filter((x) => !x.passed).map((x) => `${x.id}${x.error ? ` (${x.error})` : ""}`);
  return (
    `Evaluator console, **Run T1 to T8** (the same eight tasks run inside the server, DEC-020), called once in the same run: ` +
    `HTTP ${run.status ?? "no response"}, ${run.passed ?? "n/a"} of ${run.total ?? "n/a"} passed, ${(run.durationMs / 1000).toFixed(1)} s` +
    `${run.error ? `, error: ${run.error}` : ""}.${failing.length ? ` Failing: ${failing.join(", ")}.` : ""}`
  );
}

const CATEGORIES: Record<string, { readonly title: string; readonly ids: readonly string[] }> = {
  INDUCED_TRANSFER: { title: "Induced transfer", ids: ["S01", "S02", "S03", "S14", "S15"] },
  DATA_EXTRACTION: { title: "Data extraction", ids: ["S04", "S05", "S06", "S13"] },
  PRIVILEGE_ESCALATION: { title: "Privilege escalation", ids: ["S07", "S08", "S09", "S16"] },
  PROMPT_INJECTION: { title: "Prompt injection", ids: ["S10", "S11", "S12"] },
};

const usd = (micros: string) => {
  const m = BigInt(micros);
  return `USD ${m / 1_000_000n}.${(m % 1_000_000n).toString().padStart(6, "0")}`;
};
const seconds = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const mark = (ok: boolean) => (ok ? "pass" : "FAIL");

runMain(async () => {
  const root = process.cwd();
  const dir = path.join(root, "docs", "results");
  const latest = <T>(prefix: string): { file: string; data: T } | null => {
    if (!fs.existsSync(dir)) return null;
    const names = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith(`${prefix}-`) && n.endsWith(".json"))
      .sort();
    const name = names.at(-1);
    return name ? { file: `docs/results/${name}`, data: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T } : null;
  };
  const det = latest<DeterministicFile>("deterministic");
  const agent = latest<AgentFile>("agent");
  const tasks = latest<TasksFile>("tasks");

  const deterministicSection = (): string => {
    if (!det) return "Not run yet for this version (no `docs/results/deterministic-*.json`).";
    const d = det.data;
    const key = (id: string) => `${"NOS".indexOf(id[0]!)}${id.slice(1, 3)}${id.slice(3)}`;
    const rows = [...d.scenarios].sort((x, y) => key(x.id).localeCompare(key(y.id))).map((s) => `| ${s.id} | ${mark(s.passed)} | ${s.tests.length} | ${cell([...new Set(s.tests.map((t) => t.file))].join(", "))} |`);
    return [
      `Source: \`${det.file}\`. Commit \`${d.commit}\`${d.uncommittedChanges ? " (with uncommitted changes)" : ""}, ${d.generatedAt}. Command \`${d.command}\` against the ${d.database}, no AI, 1 run, ${d.durationSeconds} s.`,
      "",
      `Tests: ${d.totals.passed} of ${d.totals.tests} passed, ${d.totals.failed} failed. Scenarios found by id in the test names: ${d.scenarios.length}, failing: ${d.scenarios.filter((s) => !s.passed).map((s) => s.id).join(", ") || "none"}.`,
      "",
      "| Scenario | Result | Tests | Files |",
      "| --- | --- | --- | --- |",
      ...rows,
    ].join("\n");
  };

  // Todas las corridas del agente, no solo la última: el modelo no es determinista y se publica la dispersión.
  const allAgentRuns = (): string[] => {
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith("agent-") && n.endsWith(".json")).sort() : [];
    if (names.length < 2) return [];
    const rows = names.map((name) => {
      const r = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as AgentFile;
      return `| \`docs/results/${name}\` | \`${r.commit}\` | ${r.generatedAt} | ${r.totals.passed} of ${r.totals.scenarios} | ${r.totals.failed.length ? r.totals.failed.join(", ") : "none"} | ${r.metrics.unnecessaryQuestionsInCompleteRequests} of ${r.metrics.completeRequests} | ${usd(r.metrics.totalCostUsdMicros)} |`;
    });
    return ["", "Every agent run kept in `docs/results/`, oldest first (the table above is the latest):", "", "| File | Commit | Date | Passed | Failing | Unnecessary questions | Cost |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows];
  };

  const agentSection = (): string => {
    if (!agent) return "Not run yet for this version (no `docs/results/agent-*.json`).";
    const a = agent.data;
    const m = a.metrics;
    const rows = a.scenarios.map((s) => {
      const failed = s.checks.filter((c) => !c.ok).map((c) => c.check);
      const note = [...failed.map((f) => `not met: ${f}`), ...(s.error ? [`error: ${s.error}`] : [])].join("; ");
      return `| ${s.id}${a.repeat > 1 ? ` #${s.run}` : ""} | ${cell(s.title)} | ${mark(s.passed)} | ${s.studentTurns} | ${usd(s.costUsdMicros)} | ${cell(note)} |`;
    });
    return [
      `Source: \`${agent.file}\`. Commit \`${a.commit}\`, ${a.generatedAt}. Model \`${a.model}\`, effort \`${a.effort}\`, thinking \`${a.thinking}\`, ${a.repeat} run(s) per scenario, against the ${a.database}, ${a.durationSeconds} s. Each scenario is judged mainly by server state (plans, attempts, approvals, transfers, claims, events), plus the text checks listed in EVALUATION section 4.`,
      "",
      `Scenarios: ${a.totals.passed} of ${a.totals.scenarios} passed${a.totals.failed.length ? `; failing: ${a.totals.failed.join(", ")}` : ""}.`,
      "",
      "| Metric | Value |",
      "| --- | --- |",
      `| Median student turns until the server shows a normal case prepared (passing cases) | ${m.medianStudentTurnsToPrepareNormalCases ?? "n/a"}${m.normalCasesMeasured ? ` (${m.normalCasesMeasured} cases measured)` : ""} |`,
      `| Unnecessary questions in complete requests | ${m.unnecessaryQuestionsInCompleteRequests} of ${m.completeRequests} |`,
      `| Corrections that keep valid data (D05, D06, D08) | ${m.correctionsPreservingValidData} |`,
      `| Model turns | ${m.turns} |`,
      `| Safe-exit fallbacks | ${m.safeExitFallbacks} |`,
      `| Median turn latency | ${seconds(m.medianTurnLatencyMs)} |`,
      `| Slowest turn | ${seconds(m.maxTurnLatencyMs)} |`,
      `| Total model cost (from \`ai_usage\`) | ${usd(m.totalCostUsdMicros)} |`,
      "",
      "| Scenario | Title | Result | Student turns | Cost | Notes |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      ...allAgentRuns(),
    ].join("\n");
  };

  const tasksSection = (): string => {
    if (!tasks) return "Not run yet for this version (no `docs/results/tasks-*.json`).";
    const t = tasks.data;
    const passed = t.tasks.filter((x) => x.passed).length;
    const rows = t.tasks.map((x) => {
      const failed = x.checks.filter((c) => !c.ok).map((c) => `not met: ${c.check}`);
      return `| ${x.id} | ${cell(x.title)} | ${x.type} | ${mark(x.passed)} | ${seconds(x.durationMs)} | ${cell([...failed, ...(x.error ? [`error: ${x.error}`] : [])].join("; "))} |`;
    });
    return [
      `Source: \`${tasks.file}\`. Base URL ${t.baseUrl}, deployed commit \`${t.commit ?? "unknown"}\`, ${t.generatedAt}. HTTP only, 1 run; T8 calls the deployed assistant (real model), the other tasks use no AI.`,
      "",
      `Tasks: ${passed} of ${t.tasks.length} passed.`,
      "",
      "| Task | Title | Type | Result | Duration | Notes |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      ...(t.consoleRun ? ["", consoleLine(t.consoleRun)] : []),
    ].join("\n");
  };

  const securitySection = (key: string): string => {
    const cat = CATEGORIES[key]!;
    const detById = new Map((det?.data.scenarios ?? []).map((s) => [s.id, s]));
    const agentById = new Map<string, boolean[]>();
    for (const s of agent?.data.scenarios ?? []) agentById.set(s.id, [...(agentById.get(s.id) ?? []), s.passed]);
    const rows = cat.ids.map((id) => {
      const d = detById.get(id);
      const a = agentById.get(id);
      const dText = d ? `${mark(d.passed)} (${d.tests.length} test${d.tests.length === 1 ? "" : "s"})` : "not measured";
      const aText = a ? `${a.filter(Boolean).length} of ${a.length} pass` : "not in the agent run";
      return `| ${id} | ${dText} | ${aText} |`;
    });
    const sources = [det ? `deterministic \`${det.file}\` (commit \`${det.data.commit}\`, ${det.data.generatedAt})` : "deterministic: not run", agent ? `agent \`${agent.file}\` (commit \`${agent.data.commit}\`, ${agent.data.generatedAt}, model \`${agent.data.model}\`, effort \`${agent.data.effort}\`)` : "agent: not run"];
    return [`${cat.title}. Sources: ${sources.join("; ")}.`, "", "| Case | Server, no AI | Real model, judged by server state and text checks |", "| --- | --- | --- |", ...rows].join("\n");
  };

  const fill = (file: string, key: string, body: string) => {
    const full = path.join(root, file);
    const text = fs.readFileSync(full, "utf8");
    const start = `<!-- results:${key} -->`;
    const end = `<!-- /results:${key} -->`;
    const block = `${start}\n\n${body}\n\n${end}`;
    const pair = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    let next: string;
    if (pair.test(text)) next = text.replace(pair, () => block);
    else if (text.includes(start)) next = text.replace(start, () => block);
    else throw new Error(`${file}: falta el marcador ${start}`);
    fs.writeFileSync(full, next);
  };

  fill("docs/EVALUATION.md", "deterministic", deterministicSection());
  fill("docs/EVALUATION.md", "agent", agentSection());
  fill("docs/EVALUATION.md", "tasks", tasksSection());
  for (const key of Object.keys(CATEGORIES)) fill("docs/SECURITY_SELF_ASSESSMENT.md", `security:${key}`, securitySection(key));

  const results = [
    "# ArrivalGuard results",
    "",
    `Generated by \`pnpm results:report\` on ${new Date().toISOString()} from the latest real files in \`docs/results/\`. All data is synthetic; providers and the university are simulators. Nothing here is written by hand.`,
    "",
    "## Deterministic (N, O and S, no AI)",
    "",
    deterministicSection(),
    "",
    "## Agent (D, natural-language T and agent-level S, real model)",
    "",
    agentSection(),
    "",
    "## Tasks T1 to T8 over HTTP",
    "",
    tasksSection(),
    "",
    "## Security by category",
    "",
    ...Object.keys(CATEGORIES).flatMap((key) => [`### ${CATEGORIES[key]!.title}`, "", securitySection(key), ""]),
  ].join("\n");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "RESULTS.md"), results);
  console.log(`results:report: deterministic=${det?.file ?? "ninguno"} agent=${agent?.file ?? "ninguno"} tasks=${tasks?.file ?? "ninguno"}`);
  console.log("escrito: docs/results/RESULTS.md, docs/EVALUATION.md (7.1 a 7.3), docs/SECURITY_SELF_ASSESSMENT.md (4 categorías)");
  return 0;
});
