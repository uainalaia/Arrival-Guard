import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// VC1: el dominio es puro y ningún monto pasa por punto flotante en el dominio ni en los mappers.

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const DOMAIN = path.join(SRC, "domain");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const pattern = /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specs.push(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
  return specs;
}

const domainFiles = walk(DOMAIN);
const mapperFiles = walk(SRC).filter((file) => /Mapper\.ts$/.test(file));
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

describe("Arquitectura: dominio puro (BUILD_PROMPT 4.4)", () => {
  it("hay archivos de dominio que revisar", () => {
    expect(domainFiles.length).toBeGreaterThan(10);
  });

  it("el dominio no importa next, drizzle-orm, pg, @anthropic-ai/sdk, módulos de Node ni capas externas", () => {
    const forbidden = [/^next(\/|$)/, /^drizzle-orm(\/|$)/, /^pg$/, /^@anthropic-ai\//, /^@vercel\//, /^node:/, /^(fs|path|crypto|http|https)$/, /^react(\/|$)/, /^zod$/, /^@\/(infrastructure|application|interfaces|app|ui)(\/|$)/];
    const violations: string[] = [];
    for (const file of domainFiles) {
      for (const spec of importSpecifiers(fs.readFileSync(file, "utf8"))) {
        if (forbidden.some((re) => re.test(spec))) violations.push(`${rel(file)} importa ${spec}`);
        if (spec.startsWith(".")) {
          const target = path.resolve(path.dirname(file), spec);
          if (!target.startsWith(DOMAIN)) violations.push(`${rel(file)} sale del dominio con ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("Arquitectura: dinero sin punto flotante (VC1)", () => {
  it("no hay parseFloat, toFixed ni Number( en src/domain ni en los mappers", () => {
    const files = [...domainFiles, ...mapperFiles];
    expect(mapperFiles.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      for (const [label, re] of [["parseFloat", /\bparseFloat\b/], ["toFixed", /\.toFixed\s*\(/], ["Number(", /\bNumber\s*\(/], ["parseInt sobre montos", /\bparseInt\s*\(/]] as const) {
        if (re.test(code)) violations.push(`${rel(file)}: ${label}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("los tipos de dinero del dominio usan bigint", () => {
    const money = fs.readFileSync(path.join(DOMAIN, "money", "Money.ts"), "utf8");
    expect(money).toMatch(/readonly minor: bigint/);
    const dto = fs.readFileSync(path.join(SRC, "application", "dto", "MoneyDTO.ts"), "utf8");
    expect(dto).toMatch(/readonly minor: string/);
  });
});

describe("Arquitectura: nomenclatura DTO y Mapper en singular (BUILD_PROMPT 4.4)", () => {
  it("ningún archivo, carpeta o clase usa DTOs ni Mappers", () => {
    const all = walk(SRC);
    const violations = all.filter((file) => /DTOs\b|Mappers\b/.test(rel(file)) || /\b(class|interface|type)\s+\w*(DTOs|Mappers)\b/.test(fs.readFileSync(file, "utf8")));
    expect(violations.map(rel)).toEqual([]);
  });
});
