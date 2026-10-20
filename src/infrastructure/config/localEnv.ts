import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Carga `.env.local` en `process.env` sin pisar variables ya definidas.
 * Solo para scripts y pruebas: Next.js carga `.env.local` por su cuenta y en Vercel el archivo no existe.
 * Nunca imprime valores.
 */
export function loadLocalEnv(root: string = process.cwd()): boolean {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return false;
  const parsed = parseEnv(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (current === undefined || current === "") process.env[key] = value;
  }
  return true;
}
