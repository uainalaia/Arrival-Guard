import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Integración, API y seguridad contra la rama dev de Neon. Cada prueba crea su propio espacio.
        // 120 s por prueba: desde Lima cada viaje a Neon (us-east-1) tarda ~100 ms y un flujo T1 completo ~23 s (DEC-014).
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts", "tests/api/**/*.test.ts", "tests/security/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/setup/env.ts"],
          testTimeout: 120_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          // Cada prueba crea su propio espacio: pueden correr en paralelo dentro de un archivo.
          sequence: { concurrent: true },
          maxConcurrency: 6,
        },
      },
    ],
  },
});
