# Decisiones

Registro de decisiones que no están en `docs/BUILD_PROMPT.md` ni en `docs/UI_UX_PROMPT.md`, o que los ajustan a la realidad del entorno. Cada entrada tiene fecha y hora de Lima, la decisión, el motivo y la fuente. Las entradas no se borran: si una decisión cambia, se agrega otra que la reemplaza.

---

## DEC-001. La rama de producción de Neon se llama `production`

- **Fecha:** domingo 18 de octubre, 17:42 (Lima). **Fuente:** indicación de los humanos.
- **Decisión:** la rama de Neon que los documentos llaman `main` (producción) se llama **`production`** en el proyecto real. La rama de desarrollo se llama `dev`, como en los documentos.
- **Cómo se aplica:**
  - Toda mención a "la rama `main` de Neon" en BUILD_PROMPT, AUTONOMIA y ARRANQUE se refiere a `production`. Eso incluye la prohibición de AUTONOMIA 7: no se borra la rama `production` de Neon.
  - Vercel **Production** usa las cadenas de Neon `production`. Vercel **Preview** y `.env.local` usan las de Neon `dev`.
  - Las ramas de **git** no cambian: `main` es producción (despliega en Vercel) y `dev` es la de trabajo.
  - El build de producción (`pnpm db:migrate && pnpm build`, AUTONOMIA 4) migra la rama `production` de Neon con la `DATABASE_URL_UNPOOLED` que los humanos cargaron en Vercel. En local nunca se usan credenciales de `production`.
  - Los documentos entregables (README y TECHNICAL) nombran la rama como `production`.

## DEC-002. `APP_BASE_URL` por entorno

- **Fecha:** domingo 18 de octubre, 17:42 (Lima). **Fuente:** indicación de los humanos y `vercel env ls` (solo nombres).
- **Decisión:**
  - Producción: `APP_BASE_URL=https://arrivalguard.vercel.app`, el dominio de producción que asignó Vercel al proyecto `arrivalguard`.
  - Local: `APP_BASE_URL=http://localhost:3000`.
  - Preview: no tiene `APP_BASE_URL` en Vercel, y está bien así, porque la URL de cada preview cambia. La configuración del servidor la deriva de las variables de sistema de Vercel (`VERCEL_BRANCH_URL` o `VERCEL_URL`, con `https://`). Ninguna parte del build exige `APP_BASE_URL` en Preview.
- **Uso:** origen esperado para la verificación de `Origin` (BUILD_PROMPT 11 y 14.1) y enlaces absolutos. `smoke` corre contra `https://arrivalguard.vercel.app`, nunca contra un preview (AUTONOMIA 4).

## DEC-003. pnpm 12.14.0 instalado de forma global

- **Fecha:** domingo 18 de octubre, 16:37 (Lima). **Fuente:** verificación previa (`npm view pnpm dist-tags`).
- **Decisión:** pnpm no estaba instalado. Se instaló la última estable, 12.14.0, con `npm install -g pnpm@12.14.0` en el prefijo de usuario (`%APPDATA%\npm`). En la Fase 0 se fija en `package.json` con `"packageManager": "pnpm@12.14.0"` para que Vercel use la misma versión.

## DEC-004. Efectos de `vercel link` revertidos en `.gitignore`

- **Fecha:** domingo 18 de octubre, 17:14 (Lima). **Fuente:** `git diff .gitignore` después de `vercel link`.
- **Decisión:** `vercel link` agregó `.vercel` y `.env*` al final de `.gitignore`. Se revirtió porque `.env*`, por ir al final, volvía a ignorar `.env.example`, que la sección 17 exige versionar. Las líneas que ya existían (`.vercel/` y `.env*.local`) cubren lo que Vercel quería proteger. Si alguien vuelve a correr `vercel link`, hay que revisar `.gitignore` antes del commit.

## DEC-005. Configuración 13.1 del modelo validada con una llamada mínima

- **Fecha:** domingo 18 de octubre, 17:40 (Lima). **Fuente:** referencia de la API de Claude (caché del 6 de octubre de 2026) y llamada real con el script de verificación previa.
- **Decisión:** se mantiene la configuración de BUILD_PROMPT 13.1 para `claude-sonnet-5-5`: `thinking: { type: "between_tools" }` sin otros campos, `output_config: { effort: "low" }` (con `between_tools` solo se admiten `low`, `medium` o `high`, y el effort no cambia a mitad de conversación) y `tool_choice: { type: "auto" }` (`any` y `tool` devuelven 400). Una llamada mínima con esa configuración y una herramienta `strict: true` respondió `stop_reason end_turn` (381 tokens de entrada, 4 de salida). Falta la prueba completa con `tool_use` real, que hace la Fase 0.
- **Precios de referencia** (misma caché, a confirmar en la página oficial durante la Fase 0): USD 2.00 por millón de tokens de entrada, USD 10.00 de salida y USD 0.20 de lectura de caché. La escritura de caché se fija en la Fase 0 con la página de precios.

## DEC-006. `sslmode=require` en las cadenas de Neon

- **Fecha:** domingo 18 de octubre, 17:40 (Lima). **Fuente:** aviso de `pg` 8.23 durante la verificación previa.
- **Decisión:** se usan las cadenas tal como las entrega Neon (`sslmode=require`). `pg` 8.x trata hoy `require` como `verify-full`, que es lo más estricto, y avisa que en `pg` 9 pasará a la semántica de libpq, que es más débil. En la Fase 0 se fija `pg` 8.x en el lockfile. Si se migra a `pg` 9, se cambia a `sslmode=verify-full` para no perder la verificación del certificado.

## DEC-007. Versiones de la base técnica (Fase 0)

- **Fecha:** domingo 18 de octubre, 17:50 (Lima). **Fuente:** `npm view` y dependencias pares de cada paquete.
- **Decisión:** versiones exactas en `package.json` y en el lockfile. Next.js 16.4.2 (App Router, Turbopack), React 19.3.1, Tailwind CSS 4.3.3, Drizzle ORM 0.45.4 con drizzle-kit 0.31.11, `pg` 8.23.1, Zod 4.6.7, `@anthropic-ai/sdk` 0.135.0, Vitest 5.0.5 con Vite 8.3.4 y tsx 4.23.15.
- **TypeScript 6.0.3, no 7.0.2:** typescript-eslint 8.71.2 exige `typescript <6.1.0`, y la 7 es el compilador nativo nuevo, que todavía no admite. En TS 6 `types` vale `[]` por defecto, así que `tsconfig.json` declara `"types": ["node"]`.
- **ESLint 9.39.5, no 10:** eslint-config-next admite ESLint 9 y 10, pero la 9 es la que comparte todo el ecosistema de complementos.
- **pnpm 12 y cadena de suministro:** pnpm 12 aplica una antigüedad mínima de publicación y bloquea scripts de instalación. Se eligieron `postcss@8.5.30` y `shadcn@4.21.5` (de hace 6 y 4 días) en lugar de las publicadas hoy, para no agregar excepciones. `pnpm-workspace.yaml` permite solo los scripts de `esbuild` y `unrs-resolver` (binarios nativos).
- **Instalación en Vercel:** `vercel.json` fija `installCommand` en `npm install -g pnpm@12.14.0 && pnpm install --frozen-lockfile`, para que Vercel use la misma versión de pnpm que el lockfile. No depende de variables de entorno nuevas.

## DEC-008. Precios oficiales de Claude Sonnet 5.5 (reemplaza la nota de precios de DEC-005)

- **Fecha:** domingo 18 de octubre, 17:54 (Lima). **Fuente:** https://platform.claude.com/docs/en/about-claude/pricing, leída hoy.
- **Valores por defecto** en `src/infrastructure/config/env.ts` (una variable de entorno los reemplaza): entrada USD 2.00, salida USD 10.00, lectura de caché USD 0.10 (0.05 veces la entrada para Sonnet 5.5) y escritura de caché a 5 minutos USD 2.50, todo por millón de tokens. La caché de 1 hora (USD 4.00) no se usa.
- La referencia en caché de DEC-005 decía USD 0.20 para la lectura de caché. Se corrigió con la página oficial.

## DEC-009. `sslmode` normalizado a `verify-full` en el código (ajusta DEC-006)

- **Fecha:** domingo 18 de octubre, 17:52 (Lima).
- **Decisión:** en lugar de fijar `pg` 8 y convivir con el aviso, `normalizeSslMode()` (`src/infrastructure/db/connection.ts`) reescribe `sslmode=require|prefer|verify-ca` como `verify-full` al crear el pool, el cliente de migraciones y la configuración de drizzle-kit. Es el comportamiento actual de `pg` 8, se mantiene con `pg` 9 y no requiere cambiar las cadenas cargadas por los humanos. Tiene pruebas unitarias.

## DEC-010. Alcance de `smoke` en la Fase 0

- **Fecha:** domingo 18 de octubre, 17:55 (Lima). **Fuente:** BUILD_PROMPT 17 y AUTONOMIA 4.
- **Decisión:** en la Fase 0 todavía no existen T1 ni el modo estructurado. `pnpm smoke --base-url <url>` comprueba `GET /api/health` (servicio y base de datos en `ok`) y que la página principal muestre la banda de simulación. Cuando exista T1 en modo estructurado (Fases 2 y 3), `smoke` crea un espacio de evaluación, corre T1 y exige `CREDITED`. El cierre final (objetivo, punto 3) usa esa versión completa.

## DEC-011. Prueba real de Claude de la Fase 0

- **Fecha:** domingo 18 de octubre, 17:53 (Lima). **Fuente:** `pnpm ai:check` y `docs/evidence/phase0-ai-check.json`.
- **Resultado:** con la configuración 13.1 y una herramienta `strict`, la primera llamada devolvió `tool_use` (`get_case_overview`). La segunda, con el contenido del asistente reenviado literal y el `tool_result`, devolvió `end_turn`. Uso: 487 + 591 tokens de entrada y 38 + 160 de salida.
- **Observación para la Fase 5:** el modelo citó "2,000,000 minor units" porque el resultado de la herramienta traía `minor`. Las herramientas del agente devuelven montos como decimales con código de moneda (`CNY 20,000.00`), nunca unidades menores.

## DEC-012. Decisiones de dominio de la Fase 1

- **Fecha:** domingo 18 de octubre, 18:25 (Lima). **Fuente:** BUILD_PROMPT 6, 8 y enmiendas A1 a A3. Cada punto tiene pruebas en `tests/unit/domain`.
- **Canales aceptados:** la universidad acepta los cinco canales de matrícula siempre que el dinero llegue a su cuenta registrada. Así la ruta E se descarta solo por `RECEIVER_NOT_ALLOWED`, como dice la tabla 6.2. `CHANNEL_NOT_ALLOWED` existe y está probado con una lista de canales más corta.
- **Reserva frente a fondos:** `INSUFFICIENT_FUNDS` cuando el débito supera lo que puede salir de la cuenta (saldo menos retenciones activas). `BREAKS_RESERVE` cuando el débito tocaría dinero apartado (`availableForTuition`) o dejaría el saldo bajo la reserva mínima del pagador.
- **Máximo efectivo:** al ejecutar o recotizar se usa el menor entre el máximo aprobado y el vigente del pagador, y la mayor de las dos reservas. Un pagador que baja su máximo después de aprobar siempre gana.
- **Llegada:** se calcula desde la hora virtual actual más el plazo de la ruta. El objetivo de la estudiante no puede ser posterior al vencimiento (`TARGET_LATER_THAN_DUE_DATE`).
- **Recotización (A3):** B se recotiza a USD 2,865.00 por defecto y a USD 2,905.00 con `REQUOTE_ABOVE_MAX` (spec). Para las otras rutas el spec no fija valor; se usa el débito original más USD 5.00 (A 2,825.00, C 2,845.00, D 2,885.00, E 2,835.00).
- **Versiones del plan:** un plan tiene un id fijo y versiones numeradas; cada versión es una fila. Las aprobaciones se ligan a (id, versión, huella). Re-planificar sin cambio material (por ejemplo, otro objetivo que mantiene la misma ruta) conserva la versión. Con cambio material se crea una versión nueva y la aprobación anterior queda `INVALIDATED` con los campos que cambiaron.
- **Vigencia en la huella:** `approvalExpiresAt` se fija al pedir la aprobación: mínimo entre la hora virtual de la solicitud más 24 h y el vencimiento de la obligación. Así la huella que ve el pagador es la misma que verifica el servidor.
- **Mandato:** sin mandato vigente (revocado, vencido o para otro destinatario) no hay ejecución autónoma; la remesa pide una aprobación puntual del pagador con la razón (`MANDATE_REVOKED`, `MANDATE_EXPIRED` o `MANDATE_MISSING`). Período móvil: ventana (ahora menos N días, ahora].
- **Destinatario de remesas:** una cuenta que todavía no abre no se puede verificar, así que solo se informa `RECIPIENT_ACCOUNT_NOT_OPEN` (N18). Una cuenta abierta sin verificar da `RECIPIENT_NOT_VERIFIED` (S15).
- **Canales de remesa:** el spec no los nombra; se usan `LOCAL_TRANSFER_STANDARD` (R1), `LOCAL_TRANSFER_INSTANT` (R2) y `FX_BROKER_FAST` (R3).
- **Hora virtual inicial:** `2026-10-20T09:00:00Z`, que se muestra como "Tue 20 Oct, 09:00 virtual time". La hora virtual se muestra en UTC con el rótulo *virtual time*.
- **Escenario `overpayment_refund`:** el spec no fija el saldo; se usa USD 2,140.00 (como si la matrícula ya se hubiera pagado). La devolución de USD 70.00 se abona a la cuenta de origen.
- **Formato:** `formatMoney` vive en `src/interfaces/format/money.ts`, porque lo usan la interfaz y los resultados de herramientas del agente. Nunca usa punto flotante (UI_UX 6.3).

## DEC-013. La devolución en USD es una liquidación informada por la institución, no una conversión

- **Fecha:** domingo 18 de octubre, 18:52 (Lima). **Fuente:** revisión VC1 (hallazgo VC1-1) y BUILD_PROMPT 4.2 y 6.3.
- **Decisión:** el reclamo se hace en la moneda de la obligación (CNY 500.00 de exceso verificado). La institución simulada informa el monto que liquida en la cuenta de origen: USD 70.00, tomado de la configuración del escenario (`refund.settlementUsd`). El sistema no convierte CNY a USD en ningún punto de esta operación: guarda el monto informado (`settlement`) junto al reclamo.
- **Cómo se muestra:** la interfaz y la evidencia dicen "Refunded USD 70.00, settled by the university to the paying account" y nunca presentan la cifra como resultado de una conversión ni muestran una tasa implícita. Toda conversión real del sistema sigue pasando por `convertWithQuote` con una cotización explícita.

## DEC-014. Latencia de red en pruebas de integración y región de las funciones

- **Fecha:** domingo 18 de octubre, 19:20 (Lima). **Fuente:** medición local (`select 1` y cada caso de uso de T1 contra Neon `dev`).
- **Medición:** desde Lima cada viaje de ida y vuelta a Neon (región `us-east-1`) tarda unos 100 ms. Un flujo T1 completo (crear espacio, planificar, pedir aprobación, ver, aprobar, ejecutar, consultar y avanzar el reloj) tarda unos 23 s; ejecutar un pago, unos 7 s (unos 70 viajes).
- **Decisión:** el proyecto `integration` de Vitest usa 120 s por prueba. No tapa carreras: las pruebas de concurrencia (O04) corren de verdad en paralelo contra la base y verifican un solo efecto. Producción corre en `iad1` (fijado en `vercel.json`), la misma región que Neon, así que allí cada viaje tarda pocos milisegundos.

## DEC-015. Un intento acreditado no bloquea por sí solo: decide el estado de la obligación

- **Fecha:** domingo 18 de octubre, 19:41 (Lima), durante las correcciones de VC4. **Fuente:** BUILD_PROMPT 10 ("una obligación CREDITED no admite intentos nuevos, verifícalo además en el dominio") y 14.2 (S03).
- **Antes:** `newAttemptBlockers` devolvía `OBLIGATION_NOT_PENDING` si existía cualquier intento CREDITED. Era una interpretación más amplia que el spec, que habla del estado de la OBLIGACIÓN.
- **Ahora:** la obligación acreditada se bloquea por su estado (`checkTuitionExecution` devuelve `OBLIGATION_NOT_PENDING`, con prueba unitaria y una de integración tras N01). Un pago parcial ya acreditado con la obligación todavía pendiente no bloquea: su débito cuenta para el máximo acumulado, que es lo que pide S03 ("USD 1,500.00 ya debitados y un nuevo cargo de 1,500.00 con máximo de 2,900.00": `EXCEEDS_PAYER_MAX`).
- **Prueba cambiada:** el caso unitario que exigía `OBLIGATION_NOT_PENDING` para `newAttemptBlockers(["CREDITED"])` se reemplazó por uno que fija la regla nueva. No se relajó ningún control: los dos bloqueos (estado de la obligación y máximo acumulado) siguen probados.

## DEC-016. Una matrícula acreditada no se vuelve a planificar

- **Fecha:** domingo 18 de octubre, 21:30 (Lima), durante las correcciones de VC7. **Fuente:** BUILD_PROMPT 10 ("una obligación CREDITED no admite intentos nuevos") y la revisión VC7.
- **Antes:** planificar con la obligación acreditada creaba un plan nuevo `NOT_VIABLE` (`OBLIGATION_NOT_PENDING`) que reemplazaba en la vista al plan que la pagó: la línea del pago pasaba a "bloqueada" y el sello desaparecía.
- **Ahora:** `PlanTuitionPaymentUseCase` rechaza con `OBLIGATION_NOT_PENDING` y no crea nada; la interfaz deshabilita "Plan my payment" con la matrícula pagada.
- **Prueba cambiada:** la de idempotencia usaba ese plan nuevo para demostrar "misma clave con otro contenido da 409". Ahora exige el rechazo del replan y demuestra el 409 con un segundo plan sintético preparado por la prueba (como S03 prepara su pago histórico). No se relajó ninguna aserción: el 409 sigue probado.

## DEC-017. CSP con nonce para scripts y estilos en línea permitidos

- **Fecha:** domingo 18 de octubre, 22:17 (Lima). **Fuente:** BUILD_PROMPT 14.1 y la guía de CSP de Next.js 16 (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
- **Decisión:** `src/proxy.ts` genera un nonce por petición. `script-src 'self' 'nonce-…' 'strict-dynamic'` (con `'unsafe-eval'` solo en desarrollo), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'` y `upgrade-insecure-requests` fuera de localhost. El único script en línea (el del tema) lleva el nonce.
- **Excepción:** `style-src 'self' 'unsafe-inline'`. Los componentes usan atributos `style` para anchos y tamaños calculados (barras, sello) y el aviso de sonner inserta estilos; un nonce no cubre atributos `style`. Los estilos no ejecutan código; el riesgo que queda (inyección de CSS) no alcanza a los scripts ni a los datos de la API.
- **Efecto:** todas las páginas se renderizan en el servidor por petición (el nonce lo exige). `pnpm ui:check` vigila la consola del navegador y falla ante cualquier violación de la CSP.

## DEC-018. Una remesa con aprobación puntual no consume el tope del permiso permanente

- **Fecha:** domingo 18 de octubre, 23:45 (Lima), durante las correcciones de VC9 (hallazgo VC9-5). **Fuente:** BUILD_PROMPT A1 y 6.2 ("tope por período"; "por encima del tope se crea una solicitud de aprobación puntual"). El spec no dice si lo aprobado aparte cuenta para el período.
- **Decisión:** el tope del mandato limita lo que sale **sin** que Carlos intervenga. Una remesa que Carlos aprobó en su pantalla fija, con huella, es una autorización suya y no se descuenta del período. El uso autónomo dentro de cada período sigue siendo como máximo USD 600.00 y cada remesa aprobada queda en la actividad del pagador.
- **Prueba:** "VC9-5 (DEC-018): una remesa con aprobación puntual no consume el tope del permiso; el uso autónomo sigue ≤ USD 600.00" en `tests/integration/remittanceRefund.test.ts`.

## DEC-019. Tope diario de IA por origen

- **Fecha:** domingo 18 de octubre, 23:50 (Lima), corrección del hallazgo VC9-7. **Fuente:** BUILD_PROMPT 13.6 (topes por espacio y diario) y la revisión VC9.
- **Decisión:** además de los topes del spec (USD 3.00 por espacio y USD 15.00 por día), `AI_BUDGET_PER_ORIGIN_DAILY_USD` (USD 7.50 por defecto) limita el gasto del día de todos los espacios abiertos desde el mismo hash de IP. Así un solo origen con el código no deja al resto del jurado en modo estructurado. La reserva sigue siendo atómica, con bloqueos en orden fijo: el del día, el del origen y el del espacio.
- **Límite:** jurados detrás de la misma IP comparten ese tope; USD 7.50 son cientos de turnos con los precios de DEC-008.

## DEC-020. "Run T1 to T8" corre en el servidor, en espacios nuevos

- **Fecha:** domingo 18 de octubre, 23:10 (Lima). **Fuente:** UI_UX 11.5 y DESIGN_PLAN (`ScriptedTasks`), deuda de VC7.
- **Decisión:** `POST /api/evaluation/scripted-tasks` (solo el evaluador) corre T1 a T8 con los mismos casos de uso que la API, cada tarea en un espacio sintético nuevo, y las juzga por el estado del servidor, como `pnpm tasks:run`. El espacio del evaluador solo recibe el evento `SCRIPTED_TASKS_RUN` con el resumen. T8 usa el modelo real con los topes de siempre. Límites en configuración: 3 corridas por espacio y hora, 10 por origen y día y 30 por día en total (`SCRIPTED_TASKS_PER_WORKSPACE_HOUR`, `SCRIPTED_TASKS_PER_ORIGIN_DAY`, `SCRIPTED_TASKS_PER_DAY`), y una sola corrida empieza por minuto en todo el sistema (VC9-10 y VC9-11). Un error inesperado de una tarea vuelve solo como código (VC9-12).

## DEC-021. La entrega es `v1.0.1-submission`

- **Fecha:** lunes 19 de octubre, 12:30 (Lima). **Fuente:** la autorización inicial ("v1.0.1-submission si hiciera falta una corrección crítica") y las rondas 3 y 4 de VC11.
- **Decisión:** la entrega es `v1.0.1-submission`. `v1.0.0-submission` (`ed1ed75`) queda en `origin` como historia, porque borrar o mover un tag remoto está prohibido. Hay dos motivos:
  - el informe dentro de `v1.0.0` nombraba commits que ya no correspondían;
  - ese código tenía un error del intervalo entre corridas de Run T1 to T8, con una prueba que fallaba rara vez. Su primer arreglo, además, introdujo un bloqueo encadenado de severidad alta.
  Una entrega que afirma que todo está en verde no debe llevar una prueba que falla ni un informe con datos que no corresponden.
- **Contenido:** el código `172676b` con todas las corridas oficiales (verify, eval:deterministic, eval:agent, tasks:run contra producción y smoke), y un último commit solo de documentos y resultados.

## DEC-022. Pasada de movimiento de marca y entrega `v1.0.2-submission`

- **Fecha:** lunes 19 de octubre, 20:45 (Lima). **Fuente:** pedido explícito del usuario después del congelamiento ("mejorar animaciones, fluidez... que se sienta como un producto terminado; no animación de IA sino animaciones y transiciones de marca"), con dos elecciones suyas: "marca completa" y "producción más tag nuevo". Guía: UI_UX 8 y 11.1 y DESIGN_PLAN 2.10.
- **Decisión:** se completa el movimiento que la guía especifica, sin adornos fuera de ella y sin dependencias nuevas (solo CSS y hooks propios):
  - **Tokens:** los tiempos y las curvas viven en `src/ui/theme/tokens.css`, con tres nuevos (`--ag-dur-journey` 400 ms, `--ag-dur-drift` 2 s y `--ag-stagger-flap` 30 ms). Los keyframes viven solo en `src/ui/theme/motion.css`; los componentes usan `duration-fast|base|slow`, `ease-standard` y `animate-ag-*`. Se quitan los dos `<style>` que inyectaban `JourneyLine` y `ConsentSeal`.
  - **Firma 1 (línea del pago):** el tramo se llena en 400 ms y la estación nueva aparece después. *Credited* se llena de `arrive` y luego aparece el check. Se anima solo lo que cambia en vivo, nunca lo que ya estaba al montar o al recargar.
  - **Firma 2 (sello):** se estampa en 320 ms una sola vez por aprobación (registro en `sessionStorage` dentro de try/catch, `src/ui/lib/stamps.ts`). No vuelve a estamparse al montar de nuevo la vista ni al recargar.
  - **Transiciones de estado de 120 a 180 ms:** hoja lateral, acordeones y bloques plegables (`Collapse`), aviso (sonner con `base` y la curva estándar), errores de campo, avisos de bloqueo, menú de rol móvil (se cierra con Escape o al tocar fuera), pestañas móviles, píldoras de estado, barras de fondos y de caja, medidor del permiso, turnos nuevos del chat, filas nuevas de la bitácora y estado de Run T1 to T8.
  - **Cambio de rol:** la vista se monta con la última lectura de ese rol (`src/ui/lib/resourceCache.ts`, solo en memoria del cliente; en el servidor no guarda nada). Queda inerte y algo atenuada hasta que llega la lectura nueva; así la línea del pago anima lo que cambió mientras tanto. Un error sin lectura nueva se muestra aunque haya algo guardado.
  - **Landing:** el tablero de llegadas (`src/ui/landing/ArrivalsBoard.tsx`) recorre una sola vez, en menos de 5 s, Waiting for Carlos, Approved (se estampa el sello), Accepted by provider y Credited. Al llegar a Credited, cada letra del estado gira con 30 ms de desfase (P2 de UI_UX 11.1). El servidor manda el primer paso. En móvil, la píldora de estado va en su fila (cierra la deuda de VC7). Las anclas se desplazan suave solo al pulsarlas.
  - **Movimiento reducido e impresión:** todo cambia de golpe y se ve el estado final. El tramo incierto queda quieto.
- **Alcance:** solo interfaz. `git diff bd12847 -- src/domain src/application src/infrastructure src/interfaces src/app/api src/proxy.ts drizzle` sale vacío, así que las corridas oficiales sobre `172676b` (deterministas, agente, `tasks:run`) siguen describiendo el mismo servidor.
- **Pruebas:**
  - `tests/unit/ui/motionTokens.test.ts`: tokens de la guía, ningún `cubic-bezier` fuera de tokens.css, ningún keyframe fuera de motion.css, ninguna clase `duration-[…]`, `ease-[…]` ni `delay-[…]`, ninguna animación continua sin `motion-safe:`, ningún tiempo suelto en motion.css y ningún `<style>` en `src/ui`.
  - `tests/unit/ui/stamps.test.ts` y `tests/unit/ui/resourceCache.test.ts`.
  - `scripts/ui-check.ts` suma seis pasos: el sello se estampa una vez y no al recargar; la llegada a Credited se anima en vivo y no al recargar; el aviso usa 180 ms y la curva estándar; el tablero llega a Credited en menos de 8 s sin repetirse; con movimiento reducido muestra el estado final de inmediato. Espera a que terminen las animaciones antes de cada captura y de axe.
- **Entrega:** `v1.0.2-submission` sobre el commit verificado. `v1.0.0-submission` y `v1.0.1-submission` quedan en `origin` como historia.

## DEC-023. Producción y la entrega quedan en lo más actualizado: `v1.0.3-submission`

- **Fecha:** lunes 19 de octubre, 21:35 (Lima). **Fuente:** pedido del usuario en la conversación: "arreglalo, en produccion debe estar lo mas actualizado".
- **Decisión:** producción sirve lo último de `dev`, con la pasada de movimiento (DEC-022). La entrega es `v1.0.3-submission`, sobre el commit que agrega la corrida de `tasks:run` contra esa producción, así que el tag, `main` y producción coinciden. Ese commit solo cambia documentos y resultados.
- **Evidencia:** `pnpm tasks:run --base-url https://arrivalguard.vercel.app` con producción en `c18a91d` (21:28): 8 de 8 tareas, y Run T1 to T8 de la consola 8 de 8 (`docs/results/tasks-2026-10-20T02-28-40-513Z.json`). Después, `pnpm results:report` reescribió las secciones de resultados.
- **Lo que no cambia:** `v1.0.0-submission` (`ed1ed75`), `v1.0.1-submission` (`bd12847`) y `v1.0.2-submission` (`c18a91d`) quedan en `origin` como historia, porque mover o borrar tags remotos está prohibido. El objetivo original pedía `v1.0.0-submission` como entrega y ninguna capacidad nueva después de las 12:00; los humanos decidieron otra cosa y eso queda anotado en BLOQUEOS (B3).
