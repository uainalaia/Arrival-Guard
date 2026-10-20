# ArrivalGuard

Modo autónomo: sigue docs/AUTONOMIA.md y no te detengas entre fases.
Al reanudar o tras compactar, lee primero CLAUDE.md, docs/AUTONOMIA.md, docs/PROGRESS.md, docs/DECISIONS.md y docs/BLOQUEOS.md. Después corre `git log --oneline -15` y `git status`, y sigue desde "Siguiente paso" de PROGRESS.

Qué construir: docs/BUILD_PROMPT.md (contenido), docs/UI_UX_PROMPT.md (marca y UI, gana en lo visual), docs/design/DESIGN_PLAN.md (pantallas), docs/plan/NOTAS_PDF.md (resumen del PDF).

## Invariantes (BUILD_PROMPT 4)
- Honestidad: nunca inventar resultados, métricas ni capturas. Lo no implementado se declara. Todo dato es sintético y se rotula.
- Dinero: `Money = { currency: "USD" | "CNY"; minor: bigint }`. En DTO/JSON `{ currency, minor: string }`; en Postgres `bigint`. Nunca punto flotante (ni `parseFloat`, `toFixed` o `Number(` sobre montos). No sumar monedas distintas; toda conversión usa una cotización explícita. Formato solo en la UI: `USD 2,860.00`.
- Autoridad: identidad, rol y espacio salen solo de la sesión del servidor, nunca del cuerpo, de un argumento de herramienta ni del texto del modelo. El modelo no tiene herramientas para aprobar, cambiar límites, agregar destinatarios, avanzar el reloj, inyectar fallas ni marcar acreditado. Una negativa verbal no es un control: todo bloqueo vive y se prueba en el servidor.
- Secretos: solo en variables de entorno del servidor. Nunca imprimirlos ni abrir `.env.local` con herramientas de lectura.
- Arquitectura: hexagonal y DDD. `src/domain` es puro (no importa next, drizzle-orm, pg ni @anthropic-ai/sdk). Casos de uso sin mapeos; todo mapeo en clases `*Mapper`. Sufijos `DTO` y `Mapper` en singular. Zod en cada frontera. Errores tipados (`DomainError`, `ApplicationError`) mapeados a HTTP en un solo `httpErrorMapper`.
- Escenarios, rutas, montos y precios viven en configuración (`src/infrastructure/scenarios`, `src/infrastructure/config`).
- Pruebas: nunca `.skip`, `.only`, asserts relajados ni números esperados cambiados. Dominio, dinero y seguridad: prueba primero.
- Documentos sin guion largo (U+2014).

## Comandos
- `pnpm install` · `pnpm dev` (http://localhost:3000)
- `pnpm verify`: typecheck, lint, test, db:seed-check, build y secrets-scan. Ninguna fase cierra en rojo.
- `pnpm test` (unidad, integración, API y seguridad contra Neon dev) · `pnpm test:unit`
- `pnpm db:generate` (drizzle-kit generate; nunca push) · `pnpm db:migrate` · `pnpm db:seed-check`
- `pnpm ai:check` (llamada real a Claude) · `pnpm ai:turns` (20 turnos reales contra dev)
- `pnpm smoke --base-url <url>` (T1 por HTTP) · `pnpm smoke:chat --base-url <url>` (T1 por chat con el modelo real)
- `pnpm ui:check --base-url <url>` (Playwright: clics, capturas, axe y CSP; contra `pnpm build && pnpm start`)
- `pnpm eval:deterministic` · `pnpm eval:agent` · `pnpm tasks:run --base-url <url>` · `pnpm results:report` (solo resultados reales)
- `pnpm secrets-scan` · `pnpm run licenses` (THIRD_PARTY_LICENSES.md; `pnpm licenses` a secas es un comando de pnpm)

## Dónde está cada cosa
- `src/domain` (value objects, agregados, PolicyEngine, consentimiento, mandato, puertos) · `src/application` (casos de uso, servicios, DTO, Mapper, errores)
- `src/infrastructure` (db, simulators, scenarios, ai, auth con sesiones y límites, security/redact, system/reloj, config) · `src/interfaces` (http, agent, format)
- `src/app` (páginas y /api con handlers delgados) · `src/proxy.ts` (CSP con nonce por petición, DEC-017) · `src/ui` (brand, primitives, finance, chat, console, workspace, landing, layout, theme)
- `tests/{unit,integration,api,security}` con `tests/support` y `tests/setup` · `scripts/` · `drizzle/` (migraciones) · `docs/results`, `docs/evidence`
- Entregables en inglés: `README.md`, `docs/TECHNICAL.md`, `docs/SECURITY_SELF_ASSESSMENT.md`, `docs/EVALUATION.md`, `docs/EXECUTION_EVIDENCE.md`, `docs/DEMO_GUIDE.md`, `docs/VIDEO_SCRIPT.md`, `docs/PITCH_OUTLINE.md`. Los marcadores `<!-- results:… -->` los llena `results:report`.

## Entorno
- Windows x64, Node 24, pnpm 12, scripts en TypeScript con tsx. Nada de `.sh`, `rm -rf` ni variables en línea en `package.json`.
- Git: `dev` es la rama de trabajo; `main` es producción (Vercel) y solo recibe merges fast-forward con `pnpm verify` en verde.
- Neon: `dev` para local, pruebas y previews; la de producción se llama `production` (los documentos dicen `main`, DEC-001).
- Producción: https://arrivalguard.vercel.app. El build de Vercel corre `pnpm db:migrate && pnpm build`. Migraciones solo aditivas.
- Prohibido: force push, reescribir historia, borrar ramas o tags remotos, tocar variables de Vercel, credenciales de producción en local.
