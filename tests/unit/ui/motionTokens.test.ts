import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// UI_UX 8 y DEC-022: todo el movimiento sale de los tokens. Los tiempos y las curvas viven en tokens.css, los keyframes
// solo en motion.css, y los componentes usan utilidades con nombre (duration-fast, ease-standard, animate-ag-*), nunca
// valores sueltos. Con movimiento reducido todo cambia de golpe.

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const TOKENS = path.join(SRC, "ui", "theme", "tokens.css");
const MOTION = path.join(SRC, "ui", "theme", "motion.css");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const read = (file: string) => fs.readFileSync(file, "utf8");
const sources = walk(SRC);
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function offenders(pattern: RegExp, files: readonly string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    read(file)
      .split("\n")
      .forEach((line, i) => {
        if (pattern.test(line)) found.push(`${rel(file)}:${i + 1}`);
      });
  }
  return found;
}

describe("Movimiento de marca: tokens (UI_UX 8)", () => {
  it("tokens.css fija los tiempos y las curvas de la guía", () => {
    const css = read(TOKENS);
    expect(css).toMatch(/--ag-dur-fast:\s*120ms;/);
    expect(css).toMatch(/--ag-dur-base:\s*180ms;/);
    expect(css).toMatch(/--ag-dur-slow:\s*320ms;/);
    expect(css).toMatch(/--ag-ease-standard:\s*cubic-bezier\(0\.2,\s*0,\s*0,\s*1\);/);
    expect(css).toMatch(/--ag-ease-exit:\s*cubic-bezier\(0\.4,\s*0,\s*1,\s*1\);/);
    expect(css).toMatch(/--ag-dur-journey:\s*400ms;/);
    expect(css).toMatch(/--ag-dur-drift:\s*2s;/);
    expect(css).toMatch(/--ag-stagger-flap:\s*30ms;/);
  });

  it("hay archivos que revisar", () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(fs.existsSync(MOTION)).toBe(true);
  });

  it("ninguna curva cubic-bezier fuera de tokens.css", () => {
    expect(offenders(/cubic-bezier\(/, sources.filter((f) => f !== TOKENS))).toEqual([]);
  });

  it("ningún keyframe fuera de motion.css", () => {
    expect(offenders(/@keyframes\b/, sources.filter((f) => f !== MOTION))).toEqual([]);
  });

  it("ninguna duración, curva o demora arbitraria en las clases (duration-[...], ease-[...], delay-[...])", () => {
    expect(offenders(/\b(duration|ease|delay)-\[/, sources)).toEqual([]);
  });

  it("las animaciones continuas de Tailwind solo con motion-safe:", () => {
    expect(offenders(/(^|[^:\w-])animate-(spin|pulse|ping|bounce)\b/, sources)).toEqual([]);
  });

  it("motion.css no usa tiempos sueltos: solo los tokens (y el instante del movimiento reducido)", () => {
    const css = stripCssComments(read(MOTION));
    const times = [...css.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)].map((m) => m[0]);
    expect(times.filter((t) => t !== "0.01ms" && t !== "0s")).toEqual([]);
  });

  it("motion.css apaga el movimiento con prefers-reduced-motion y al imprimir", () => {
    const css = stripCssComments(read(MOTION));
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/animation-delay:\s*0s\s*!important/);
    expect(reduced).toMatch(/scroll-behavior:\s*auto\s*!important/);
    expect(css).toMatch(/@media print\s*{[\s\S]*animation:\s*none\s*!important/);
  });

  it("los componentes no inyectan <style> propios: el movimiento vive en motion.css", () => {
    expect(offenders(/<style[\s>]/, sources.filter((f) => f.startsWith(path.join(SRC, "ui"))))).toEqual([]);
  });
});
