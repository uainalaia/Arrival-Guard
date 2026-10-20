import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "docs/**",
    "tmp/**",
    "drizzle/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // El dominio es puro: sin frameworks, sin base de datos, sin IA (BUILD_PROMPT 4.4).
  // Además lo prueba tests/unit/architecture.test.ts (VC1).
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*"], message: "El dominio no importa Next.js." },
            { group: ["drizzle-orm", "drizzle-orm/*", "pg"], message: "El dominio no importa la base de datos." },
            { group: ["@anthropic-ai/*"], message: "El dominio no importa el SDK de Anthropic." },
            { group: ["@/infrastructure/*", "@/application/*", "@/interfaces/*", "@/app/*", "@/ui/*"], message: "El dominio no depende de capas externas." },
          ],
        },
      ],
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Dinero sin punto flotante (BUILD_PROMPT 4.2)." }],
    },
  },
]);
