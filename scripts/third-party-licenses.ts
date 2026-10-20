import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runMain } from "./lib/args";

// licenses (BUILD_PROMPT 18): genera THIRD_PARTY_LICENSES.md con las dependencias de producción instaladas. Primero
// prueba `pnpm licenses list --json --prod` (lee node_modules, sin red); si falla, recorre el árbol de dependencias
// desde package.json leyendo cada package.json instalado. No escribe rutas locales ni descripciones, solo nombre,
// versión, licencia, autor y página. Se corre con `pnpm run licenses` (`pnpm licenses` a secas es un comando de pnpm).

interface PackageInfo {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly author: string;
  readonly homepage: string;
}

interface PnpmLicenseEntry {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license?: string;
  readonly author?: string;
  readonly homepage?: string;
}

interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly license?: string | { readonly type?: string };
  readonly licenses?: readonly { readonly type?: string }[];
  readonly author?: string | { readonly name?: string };
  readonly homepage?: string;
  readonly repository?: string | { readonly url?: string };
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

const OUTPUT = "THIRD_PARTY_LICENSES.md";

function fromPnpm(root: string): { method: string; packages: PackageInfo[] } | null {
  const run = spawnSync("pnpm licenses list --json --prod", { cwd: root, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0 || !run.stdout.trim()) return null;
  let parsed: Record<string, readonly PnpmLicenseEntry[]>;
  try {
    parsed = JSON.parse(run.stdout) as Record<string, readonly PnpmLicenseEntry[]>;
  } catch {
    return null;
  }
  const packages: PackageInfo[] = [];
  for (const [license, entries] of Object.entries(parsed)) {
    for (const entry of entries) {
      for (const version of entry.versions) {
        packages.push({ name: entry.name, version, license: entry.license ?? license, author: entry.author ?? "", homepage: entry.homepage ?? "" });
      }
    }
  }
  return { method: "`pnpm licenses list --json --prod`", packages };
}

function readManifest(dir: string): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/** Busca `node_modules/<name>` como lo hace Node: en cada carpeta ancestro que no sea node_modules. */
function resolvePackageDir(name: string, fromDir: string): string | null {
  let dir = fromDir;
  for (;;) {
    if (path.basename(dir) !== "node_modules") {
      const candidate = path.join(dir, "node_modules", name);
      if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function licenseOf(manifest: Manifest): string {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license?.type) return manifest.license.type;
  const types = (manifest.licenses ?? []).map((l) => l.type).filter(Boolean);
  return types.length ? types.join(" OR ") : "UNKNOWN";
}

function authorOf(manifest: Manifest): string {
  if (typeof manifest.author === "string") return manifest.author;
  return manifest.author?.name ?? "";
}

function homepageOf(manifest: Manifest): string {
  if (manifest.homepage) return manifest.homepage;
  const repo = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  return repo ?? "";
}

/**
 * Recorre el árbol desde las dependencias de package.json. Con `withOptional` sigue también las dependencias opcionales
 * instaladas (por ejemplo binarios por plataforma), que `pnpm licenses list --prod` no informa.
 */
function walkNodeModules(root: string, withOptional: boolean): PackageInfo[] {
  const rootManifest = readManifest(root);
  if (!rootManifest) throw new Error("No se pudo leer package.json");
  const seen = new Set<string>();
  const packages: PackageInfo[] = [];
  const queue: { name: string; from: string; optional: boolean }[] = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({ name, from: root, optional: false }));
  while (queue.length > 0) {
    const { name, from, optional } = queue.shift()!;
    const dir = resolvePackageDir(name, from);
    if (!dir) {
      // Las dependencias opcionales de otra plataforma no se instalan.
      if (!optional) console.log(`licenses: no se encontró ${name} (desde ${path.relative(root, from) || "."})`);
      continue;
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    const manifest = readManifest(dir);
    if (!manifest?.name || !manifest.version) continue;
    packages.push({ name: manifest.name, version: manifest.version, license: licenseOf(manifest), author: authorOf(manifest), homepage: homepageOf(manifest) });
    for (const dep of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dep, from: dir, optional });
    if (withOptional) for (const dep of Object.keys(manifest.optionalDependencies ?? {})) queue.push({ name: dep, from: dir, optional: true });
  }
  return packages;
}

const key = (p: PackageInfo) => `${p.name}@${p.version}`;

function uniqueSorted(packages: readonly PackageInfo[]): PackageInfo[] {
  const unique = new Map<string, PackageInfo>();
  for (const p of packages) unique.set(key(p), p);
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** Texto seguro para una celda de tabla en Markdown, sin guion largo (regla de los documentos). */
function cell(text: string): string {
  return text.replace(/\u2014/g, "-").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function render(method: string, packages: readonly PackageInfo[], optional: readonly PackageInfo[]): string {
  const sorted = uniqueSorted(packages);
  const byLicense = new Map<string, PackageInfo[]>();
  for (const p of sorted) byLicense.set(p.license, [...(byLicense.get(p.license) ?? []), p]);
  const licenses = [...byLicense.keys()].sort((a, b) => byLicense.get(b)!.length - byLicense.get(a)!.length || a.localeCompare(b));

  const lines: string[] = [];
  lines.push("# Third-party licenses", "");
  lines.push(`ArrivalGuard is released under the MIT License (see [LICENSE](LICENSE)). It uses the open source packages below in production. This file is generated by \`pnpm run licenses\` (\`scripts/third-party-licenses.ts\`) from ${method}; do not edit it by hand. Development-only tools (tests, linting, type checking) are not listed.`, "");
  lines.push(`Packages: ${sorted.length}. The full license text of each package is distributed with the package itself.`, "");
  lines.push("| License | Packages |", "|---|---|");
  for (const license of licenses) lines.push(`| ${cell(license)} | ${byLicense.get(license)!.length} |`);
  lines.push("");
  for (const license of licenses) {
    lines.push(`## ${cell(license)}`, "", "| Package | Version | Author | Homepage |", "|---|---|---|---|");
    for (const p of byLicense.get(license)!) lines.push(`| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.author)} | ${cell(p.homepage)} |`);
    lines.push("");
  }
  const extra = uniqueSorted(optional);
  if (extra.length > 0) {
    lines.push("## Optional packages installed on this platform", "");
    lines.push("Optional dependencies (for example platform-specific binaries) that were installed on the machine that generated this file. The deployment platform may install a different variant of the same package.", "");
    lines.push("| Package | Version | License | Author | Homepage |", "|---|---|---|---|---|");
    for (const p of extra) lines.push(`| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.license)} | ${cell(p.author)} | ${cell(p.homepage)} |`);
    lines.push("");
  }
  return lines.join("\n");
}

runMain(async () => {
  const root = process.cwd();
  const listed = fromPnpm(root) ?? { method: "the production dependency tree read from `node_modules` (each installed `package.json`)", packages: walkNodeModules(root, false) };
  if (listed.packages.length === 0) {
    console.log("licenses: no se encontraron dependencias de producción instaladas (¿falta pnpm install?)");
    return 1;
  }
  const known = new Set(listed.packages.map(key));
  const optional = walkNodeModules(root, true).filter((p) => !known.has(key(p)));
  fs.writeFileSync(path.join(root, OUTPUT), render(listed.method, listed.packages, optional));
  console.log(`licenses: ${OUTPUT} con ${known.size} paquetes (${listed.method.replace(/`/g, "")}) y ${uniqueSorted(optional).length} opcionales instalados`);
  return 0;
});
