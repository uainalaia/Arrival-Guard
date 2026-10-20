import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { getArg, hasFlag, runMain } from "./lib/args";

// VC7 (AUTONOMIA 6): T1 completa solo con clics contra un servidor en marcha, con capturas a 1440 × 900 y 390 × 844
// en claro y oscuro (docs/design/screens/) y una pasada de axe por pantalla (docs/evidence/ui-axe.json).
// No es la suite E2E de P2: es un recorrido mínimo que falla si algún paso no aparece. Desde DEC-022 también revisa el
// movimiento de marca (UI_UX 8): el sello se estampa una vez, la llegada a Credited se anima solo en vivo, el aviso usa
// los tiempos de marca y el tablero de la landing llega a Credited una sola vez (y de inmediato con movimiento reducido).
// Uso: pnpm ui:check --base-url http://localhost:3000 [--no-shots]

const SCREENS_DIR = path.join(process.cwd(), "docs", "design", "screens");
const EVIDENCE = path.join(process.cwd(), "docs", "evidence", "ui-axe.json");
const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;
const THEMES = ["light", "dark"] as const;

/** Violaciones de la CSP y errores de página vistos en la consola del navegador (deben ser 0). */
const consoleProblems: string[] = [];
function watchConsole(page: Page, where: string): void {
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy|Refused to (execute|load|apply)/i.test(msg.text())) consoleProblems.push(`${where}: ${msg.text().slice(0, 160)}`);
  });
  page.on("pageerror", (err) => consoleProblems.push(`${where}: ${err.message.slice(0, 160)}`));
}

interface AxeRow {
  readonly screen: string;
  /** Ancho del documento menos el de la ventana: debe ser 0 (sin scroll horizontal, UI_UX 14). */
  readonly horizontalOverflowPx: number;
  readonly serious: number;
  readonly critical: number;
  readonly ids: string[];
}

runMain(async () => {
  loadLocalEnv();
  const baseUrl = (getArg("base-url") ?? "http://localhost:3000").replace(/\/$/, "");
  const shots = !hasFlag("no-shots");
  const code = process.env.EVAL_ACCESS_CODE;
  if (!code) {
    console.log("EVAL_ACCESS_CODE: ausente");
    return 1;
  }
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  const browser = await chromium.launch();
  const axe: AxeRow[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: baseUrl });
    const page = await context.newPage();
    watchConsole(page, "recorrido");
    await recordAnimations(page);
    const step = async (label: string, action: () => Promise<void>) => {
      const started = Date.now();
      try {
        await action();
      } catch (error) {
        const shot = getArg("fail-shot");
        if (shot) await page.screenshot({ path: shot, fullPage: true });
        console.log(`FAIL ${label}: ${page.url()}`);
        throw error;
      }
      console.log(`OK   ${label} (${Date.now() - started} ms)`);
    };

    await step("landing", async () => {
      await page.goto("/");
      await page.getByRole("heading", { name: /Tuition that arrives/ }).waitFor();
    });

    // UI_UX 11.1: el servidor manda el primer paso y el guion llega a Credited una sola vez, sin repetirse.
    await step("tablero de llegadas: de Waiting for Carlos a Credited, una sola vez", async () => {
      const html = await (await page.request.get("/")).text();
      if (!html.includes('data-step="0"')) throw new Error("el servidor no manda el tablero en el primer paso");
      const board = page.locator('figure[data-step="3"]');
      await board.waitFor({ timeout: 8_000 });
      // Con el giro, cada letra va en su celda: el texto completo queda para lectores de pantalla.
      if (!(await board.textContent())?.includes("Status: Credited by the university")) throw new Error("el tablero no dice Credited by the university");
      const seen = await animationsSeen(page);
      if (!seen.includes("ag-seal-stamp") || !seen.includes("ag-flap")) throw new Error(`el guion no estampó el sello o no giró el tablero: ${seen.join(", ")}`);
      await page.waitForTimeout(2_000);
      const stepNow = await page.locator("figure[data-step]").first().getAttribute("data-step");
      if (stepNow !== "3") throw new Error(`el tablero volvió a empezar (paso ${stepNow})`);
    });

    await step("tablero de llegadas con movimiento reducido: estado final de inmediato", async () => {
      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: baseUrl, reducedMotion: "reduce" });
      try {
        const still = await reduced.newPage();
        watchConsole(still, "landing-reduced");
        await still.goto("/");
        await still.locator('figure[data-step="3"]').waitFor({ timeout: 3_000 });
      } finally {
        await reduced.close();
      }
    });
    await capture(browser, baseUrl, context, "landing", "/", shots, axe);
    await capture(browser, baseUrl, context, "system", "/system", shots, axe);

    // Botón de tema en el inicio: sistema → claro → oscuro → sistema, aplicado en <html data-theme> y recordado.
    await step("botón de tema en el inicio: claro, oscuro y de vuelta a sistema", async () => {
      const toggle = page.getByRole("button", { name: /^Theme:/ });
      const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? "system");
      await toggle.click();
      if ((await theme()) !== "light") throw new Error(`esperaba light, hay ${await theme()}`);
      await toggle.click();
      if ((await theme()) !== "dark") throw new Error(`esperaba dark, hay ${await theme()}`);
      await page.reload();
      if ((await theme()) !== "dark") throw new Error("el tema elegido no se recordó al recargar");
      await page.getByRole("button", { name: /^Theme: Dark/ }).click();
      if ((await theme()) !== "system") throw new Error(`esperaba system, hay ${await theme()}`);
    });

    await step("acceso con el código de evaluación (escenario base)", async () => {
      await page.getByLabel("Evaluation code").fill(code);
      await page.getByRole("radio", { name: /Base scenario/ }).check();
      await page.getByRole("button", { name: "Open the demo" }).click();
      await page.waitForURL(/\/w\/[0-9a-f-]+\?as=student/);
      await page.getByRole("heading", { name: "Tuition invoice" }).waitFor();
    });
    const workspaceUrl = new URL(page.url());
    const workspacePath = workspaceUrl.pathname;
    await capture(browser, baseUrl, context, "student-empty", `${workspacePath}?as=student`, shots, axe);

    await step("Plan my payment (48 h): ruta B", async () => {
      // El chat es el modo por defecto: T1 por clics usa los controles estructurados.
      await page.getByRole("button", { name: "Use structured controls" }).click();
      await page.getByRole("button", { name: "Plan my payment" }).last().click();
      await page.getByText("Plan ready").first().waitFor();
      const routes = page.locator("section", { has: page.getByRole("heading", { name: "Routes" }) });
      await routes.getByText("Lowest cost that meets every rule").first().waitFor();
      if ((await routes.getByText("Edu Pay Partner").count()) === 0) throw new Error("La ruta elegida no es B (Edu Pay Partner)");
    });

    await step("Request approval", async () => {
      await journey(page).getByRole("button", { name: "Request approval" }).click();
      await page.getByText("Approval requested from Carlos").first().waitFor();
    });
    await capture(browser, baseUrl, context, "student-waiting", `${workspacePath}?as=student`, shots, axe);

    await step("Carlos abre la solicitud", async () => {
      await page.getByRole("tab", { name: /Carlos, payer/ }).click();
      await page.waitForURL(/as=payer/);
      await page.getByRole("link", { name: "Review and approve" }).click();
      await page.getByRole("heading", { name: "Payment approval" }).waitFor();
    });
    const approvalPath = new URL(page.url()).pathname;
    await capture(browser, baseUrl, context, "approval-pending", approvalPath, shots, axe, THEMES, true);

    await step("Approve this payment: aparece el sello", async () => {
      await clearAnimations(page);
      await page.getByRole("button", { name: "Approve this payment" }).click();
      await page.getByText(/Approved by Carlos Ramos/).waitFor();
      await page.getByRole("img", { name: /Consent seal, fingerprint/ }).first().waitFor();
      await waitForAnimation(page, "ag-seal-stamp");
    });

    // Firma 2 (UI_UX 8): el sello se estampa una vez por aprobación y nunca al volver a montar la vista.
    await step("el sello no se vuelve a estampar al recargar", async () => {
      await page.reload();
      await page.getByRole("img", { name: /Consent seal, fingerprint/ }).first().waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      const seen = await animationsSeen(page);
      if (seen.includes("ag-seal-stamp")) throw new Error("el sello se estampó otra vez al recargar");
    });
    await capture(browser, baseUrl, context, "approval-approved", approvalPath, shots, axe, THEMES, true);
    await capture(browser, baseUrl, context, "payer", `${workspacePath}?as=payer`, shots, axe);

    await step("Sofía envía el pago", async () => {
      await page.getByRole("link", { name: "Requests" }).click();
      await page.waitForURL(/as=payer/);
      await page.getByRole("tab", { name: /Sofía, student/ }).click();
      await page.waitForURL(/as=student/);
      await journey(page).getByRole("button", { name: "Send payment" }).click();
      await page.getByText(/Waiting for the university/).first().waitFor();
    });

    await step("Check this payment: el mismo pago, todavía en la universidad", async () => {
      await journey(page).getByRole("button", { name: "Check this payment" }).click();
      // El aviso (toast) que devuelve la consulta, no el texto fijo del panel.
      const toast = page.locator("[data-sonner-toast]", { hasText: "Still waiting for the university" }).first();
      await toast.waitFor();
      // El aviso entra con los tiempos de marca (motion.css): 180 ms con la curva estándar.
      const timing = await toast.evaluate((el) => {
        const style = getComputedStyle(el);
        return { duration: style.transitionDuration, easing: style.transitionTimingFunction };
      });
      if (!timing.duration.split(",").every((d) => d.trim() === "0.18s")) throw new Error(`el aviso no dura 180 ms: ${timing.duration}`);
      if (!timing.easing.includes("cubic-bezier(0.2, 0, 0, 1)")) throw new Error(`el aviso no usa la curva estándar: ${timing.easing}`);
    });

    await step("El evaluador avanza 24 horas", async () => {
      await page.getByRole("tab", { name: "Evaluator" }).click();
      await page.waitForURL(/as=evaluator/);
      await page.getByRole("button", { name: "24 hours" }).click();
      await page.getByText(/Virtual time moved to/).first().waitFor();
    });
    await capture(browser, baseUrl, context, "console", `${workspacePath}?as=evaluator`, shots, axe, ["dark"]);

    // Run T1 to T8 (UI_UX 11.5): el servidor corre las ocho tareas en espacios nuevos; T8 usa el modelo real.
    await step("El evaluador corre T1 a T8 desde la consola: 8 de 8", async () => {
      await page.getByRole("button", { name: "Run T1 to T8" }).click();
      await page.locator("[data-sonner-toast]", { hasText: "Scripted tasks: 8 of 8 passed" }).first().waitFor({ timeout: 90_000 });
      await settle(page);
      if (shots) await page.screenshot({ path: path.join(SCREENS_DIR, "console-scripted-tasks-desktop-dark.png"), fullPage: true });
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      axe.push({ screen: "console-scripted-tasks-desktop-dark", horizontalOverflowPx: overflow, serious: bad.filter((v) => v.impact === "serious").length, critical: bad.filter((v) => v.impact === "critical").length, ids: bad.map((v) => v.id) });
    });

    await step("Sofía ve CREDITED con el recibo de la universidad", async () => {
      await clearAnimations(page);
      await page.getByRole("tab", { name: /Sofía, student/ }).click();
      await page.waitForURL(/as=student/);
      await journey(page).getByText(/Receipt AU-RC-/).first().waitFor();
      await page.getByText("Credited by the university").first().waitFor();
      // Firma 1: al volver a Sofía la vista guardada pasa a la nueva y la llegada se anima en vivo.
      await waitForAnimation(page, "ag-journey-credit");
    });

    await step("la llegada a Credited no se vuelve a animar al recargar", async () => {
      await page.reload();
      await journey(page).getByText(/Receipt AU-RC-/).first().waitFor();
      await settle(page);
      await page.waitForTimeout(800);
      const seen = await animationsSeen(page);
      const replayed = seen.filter((name) => name === "ag-journey-credit" || name === "ag-station-in" || name === "ag-seal-stamp");
      if (replayed.length > 0) throw new Error(`la línea del pago se volvió a animar al recargar: ${replayed.join(", ")}`);
    });
    await capture(browser, baseUrl, context, "student-credited", `${workspacePath}?as=student`, shots, axe);

    // T3 con clics en un espacio nuevo del escenario de transferencias: CNY 2,000 dentro del permiso permanente.
    await step("transferencia de llegada (arrival_remittance): Send transfer de CNY 2,000", async () => {
      await page.goto("/");
      await page.getByLabel("Evaluation code").fill(code);
      await page.getByRole("radio", { name: /Arrival transfers/ }).check();
      await page.getByRole("button", { name: "Open the demo" }).click();
      await page.waitForURL(/\/w\/[0-9a-f-]+\?as=student/);
      await page.getByRole("button", { name: "Use structured controls" }).click();
      await page.getByRole("button", { name: "Send transfer" }).first().click();
      await page.getByRole("button", { name: "Check this transfer" }).click();
      await page.locator("[data-sonner-toast]", { hasText: "Transfer ready to send" }).first().waitFor();
      await page.getByRole("button", { name: "Send transfer" }).last().click();
      await page.locator("[data-sonner-toast]", { hasText: "Transfer sent" }).first().waitFor();
      const transfers = page.locator("section", { has: page.getByRole("heading", { name: /Transfers to/ }) });
      await transfers.getByText("Accepted by provider").first().waitFor();
    });
    await capture(browser, baseUrl, context, "student-transfer", new URL(page.url()).pathname + "?as=student", shots, axe);

    fs.writeFileSync(EVIDENCE, `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, screens: axe }, null, 2)}\n`);
    const serious = axe.reduce((n, r) => n + r.serious + r.critical, 0);
    console.log(`axe: ${axe.length} capturas revisadas, ${serious} violaciones serias o críticas (${path.relative(process.cwd(), EVIDENCE)})`);
    const wide = axe.filter((r) => r.horizontalOverflowPx > 0);
    console.log(`scroll horizontal: ${wide.length === 0 ? "ninguno" : wide.map((r) => `${r.screen} (+${r.horizontalOverflowPx} px)`).join(", ")}`);
    console.log(`consola (CSP y errores de página): ${consoleProblems.length === 0 ? "sin problemas" : consoleProblems.length}`);
    for (const p of consoleProblems.slice(0, 10)) console.log(`  ${p}`);
    if (wide.length > 0 || serious > 0 || consoleProblems.length > 0) return 1;
    console.log("ui:check: OK (T1 CREDITED solo con clics)");
    return 0;
  } finally {
    await browser.close();
  }
});

/**
 * Anota el nombre de cada animación CSS que empieza en la página, desde antes de que corra su código (también tras
 * recargar). Va por el protocolo de depuración del navegador, no como script de la página, así que no toca la CSP.
 */
async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __agAnimations: string[] };
    w.__agAnimations = [];
    document.addEventListener("animationstart", (event) => w.__agAnimations.push(event.animationName), true);
  });
}

async function clearAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __agAnimations: string[] }).__agAnimations.length = 0;
  });
}

function animationsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => [...((window as unknown as { __agAnimations?: string[] }).__agAnimations ?? [])]);
}

async function waitForAnimation(page: Page, name: string, timeoutMs = 4_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await animationsSeen(page)).includes(name)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`no empezó la animación ${name}: ${(await animationsSeen(page)).join(", ") || "ninguna"}`);
}

/** Espera a que terminen las animaciones y transiciones finitas antes de capturar o pasar axe (como mucho 3 s). */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]),
  );
}

/** El panel "Payment journey" de la zona B: ahí vive el siguiente paso (el acordeón de la zona A repite los nombres). */
function journey(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { name: "Payment journey" }) });
}

/** Captura una pantalla en cada tamaño y tema con la misma sesión (cookies) y corre axe en cada una. */
async function capture(
  browser: Browser,
  baseUrl: string,
  source: BrowserContext,
  name: string,
  url: string,
  shots: boolean,
  axe: AxeRow[],
  themes: readonly (typeof THEMES)[number][] = THEMES,
  fullPage = false,
): Promise<void> {
  const state = await source.storageState();
  for (const size of SIZES) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, baseURL: baseUrl, storageState: state, colorScheme: theme, reducedMotion: "reduce" });
      const page: Page = await context.newPage();
      watchConsole(page, `${name}-${size.name}-${theme}`);
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await settle(page);
      if (shots) await page.screenshot({ path: path.join(SCREENS_DIR, `${name}-${size.name}-${theme}.png`), fullPage });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      axe.push({
        screen: `${name}-${size.name}-${theme}`,
        horizontalOverflowPx: overflow,
        serious: bad.filter((v) => v.impact === "serious").length,
        critical: bad.filter((v) => v.impact === "critical").length,
        ids: bad.map((v) => v.id),
      });
      await context.close();
    }
  }
}
