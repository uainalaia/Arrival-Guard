# Progreso

## Estado actual

- **Hora (Lima):** lunes 19 de octubre, 21:35.
- **Fase:** todas cerradas (0 a 9), puertas G1 a G5 cumplidas. La entrega es el tag `v1.0.3-submission` (DEC-023), en el mismo commit que `main` y que producción. Es el código de `v1.0.2-submission` (la pasada de movimiento de marca, DEC-022) con la corrida final de `tasks:run` contra esa producción.
- **Subtarea en curso:** ninguna.
- **Siguiente paso exacto:** ninguno para Claude. Lo que queda es de los humanos, antes del martes 20 a las 10:59 (docs/PARA_HUMANOS.md y docs/INFORME_FINAL.md, sección 8).
- **Último `pnpm verify`:** lunes 20:30 a 20:40 sobre el código de la pasada de movimiento: exit 0, con 567 de 567 pruebas (42 archivos), `db:seed-check`, build y `secrets-scan` con los 5 valores reales. Antes de crear el tag se corre otra vez sobre el commit del tag.
- **URL de producción:** https://arrivalguard.vercel.app, con lo más actualizado (DEC-023). Producción en `c18a91d`: el smoke dio CREDITED a las 21:00 y `tasks:run` 8 de 8, con la consola 8 de 8, a las 21:28. Antes, con producción en `172676b`, el smoke dio CREDITED y `tasks:run` 8 de 8 a las 12:31.
- **Bloqueos abiertos:** B3 (docs/BLOQUEOS.md). El objetivo original pedía `v1.0.0-submission` y nada nuevo después de las 12:00; los humanos eligieron otra cosa y solo ellos pueden ajustar esa condición.
- **Gasto de IA estimado:** cerca de USD 2.61 medidos: USD 2.53 en la rama dev (475 llamadas al modelo real, `ai_usage`) y USD 0.08 en producción el lunes 19, día UTC (panel de la consola).

## Fases y puertas

| Fase | Estado | Objetivo (AUTONOMIA 8) | Cierre real | `verify` | Verificación crítica |
|---|---|---|---|---|---|
| 0 Arranque | cerrada | dom 18:00 | dom 18:01 | 17:57 exit 0 | sin VC |
| 1 Dominio | cerrada | dom 20:00 | dom 18:38 | 18:37 exit 0 | VC1 y VC2 aprobados con observaciones; VC3 corregido (docs/reviews) |
| 2 Persistencia y ejecución (G1) | cerrada, G1 cumplida | dom 23:00 | dom 19:48 | 19:46 exit 0 | VC4 corregido (2 altos, 3 medios y 2 bajos, sin críticos); VC5 aprobado (docs/reviews) |
| 3 API, sesiones y acceso | cerrada | lun 00:30 | dom 20:38 | 20:37 exit 0 | VC6 sin críticos ni altos; 2 medios y 6 bajos corregidos (docs/reviews/VC6.md) |
| 4 Interfaz | cerrada | lun 03:00 | dom 21:49 (en `main` 22:33) | 21:48 exit 0 | VC7 corregido: 1 alto, 8 medios, 7 bajos, sin críticos (docs/reviews/VC7.md) |
| 5 Agente (G2) | cerrada, G2 cumplida | lun 05:00 | dom 22:34 | 22:25 exit 0 | VC8 aprobado con deuda: 3 medios y 6 bajos, sin críticos; medios y 5 bajos corregidos (docs/reviews/VC8.md) |
| 6 Capacidades P1 | cerrada | lun 09:30 | dom 22:34 | 22:25 exit 0 | sin VC |
| 7 Seguridad completa (G3) | cerrada, G3 cumplida | lun 11:30 | lun 00:28 | lun 00:25 exit 0 | VC9 en dos rondas: 1 crítico y 11 bajos, todos corregidos con regresión (uno como DEC-018); segunda ronda sin críticos, altos ni medios (docs/reviews/VC9.md) |
| 8 Evaluación y documentos (G4) | cerrada, G4 cumplida | lun 14:00 | lun 09:50 | lun 09:44 exit 0 | VC10 aprobado con deuda: 4 medios y 8 bajos, sin críticos ni altos, todos corregidos (docs/reviews/VC10.md) |
| 9 Cierre (G5) | cerrada, G5 cumplida | lun 16:00 | lun 13:05 (`v1.0.1-submission`) | lun 12:19 a 12:30 exit 0 (`172676b`, código de `v1.0.1-submission`); antes, 10:14 a 10:24 sobre `ed1ed75` (`v1.0.0`) | VC11 aprobado en la segunda ronda: 2 medios y 1 bajo corregidos, sin críticos ni altos (docs/reviews/VC11.md) |

Puertas: G1 (Fase 2), G2 (Fase 5), G3 (Fase 7), G4 (Fase 8), G5 (Fase 9).

## Fase 0: Arranque

Subtareas:
- [x] 0.1 Dependencias con versiones exactas y lockfile (DEC-007). pnpm 12, `pnpm-workspace.yaml` con `allowBuilds`.
- [x] 0.2 TypeScript estricto (6.0.3), ESLint 9 con reglas de pureza del dominio, Vitest 5 (proyectos `unit` e `integration`).
- [x] 0.3 Tailwind 4 con los tokens de UI_UX 5 (claro, oscuro y preferencia del sistema), fuentes Overpass, Source Serif 4 y Overpass Mono con `next/font`, `components.json` de shadcn.
- [x] 0.4 Drizzle conectado a Neon `dev` (pool con `attachDatabasePool`, `sslmode=verify-full`), `db:migrate` y `drizzle.config.ts`.
- [x] 0.5 Llamada real a Claude con la configuración 13.1 y una herramienta (`pnpm ai:check`): `tool_use` y después `end_turn`.
- [x] 0.6 Scripts `verify`, `smoke`, `db:seed-check`, `ai:check`; `vercel.json` con `pnpm db:migrate && pnpm build`.
- [x] 0.7 `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md`, `BLOQUEOS.md`, `PARA_HUMANOS.md`, `.env.example`.
- [x] 0.8 Commit `cf4e5a1`, push a `dev`. Vercel lo compiló en *Ready*, pero lo publicó como producción (ver nota).
- [x] 0.9 `pnpm verify` exit 0, merge fast-forward a `main`, despliegue de producción en *Ready* y `smoke` OK.

Evidencia de cierre (18:01):
- `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test`: 2 archivos, 7 pruebas en verde (incluye `select 1` contra Neon `dev`).
- `pnpm ai:check` exit 0: `llamada 1: stop_reason=tool_use`, `llamada 2: stop_reason=end_turn` (docs/evidence/phase0-ai-check.json).
- `pnpm build` exit 0 (rutas `/`, `/_not-found`, `/api/health`).
- `pnpm verify` (17:57): `OK typecheck`, `OK lint`, `OK test`, `OK db:seed-check`, `OK build`, `verify: TODO EN VERDE`, exit 0.
- Despliegue de producción desde `main` (`cf4e5a1`): `main:production:READY`.
- `pnpm smoke --base-url https://arrivalguard.vercel.app` (18:00): `GET /api/health -> 200 status=ok database=ok commit=cf4e5a1`, `GET / -> 200 simulation band=present`, `smoke: OK`, exit 0. Encabezados `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` y `Permissions-Policy` presentes. El dominio de producción es público.

Nota de Vercel: el primer push a `dev` generó un despliegue con destino *production* aunque la rama de producción configurada es `main` (`link.productionBranch: "main"`). Hipótesis: Vercel publica en producción el primer despliegue de un proyecto que todavía no tiene ninguno. Ese build sirvió el mismo commit que después pasó `verify`, y `db:migrate` no tenía migraciones, así que no hubo efecto sobre la base. Producción quedó luego en el despliegue de `main`. Se comprueba en el próximo push a `dev`.

## Fase 1: Dominio

Inicio: domingo 18, 18:02. Secciones: BUILD_PROMPT 4.2, 6, 7, 8; enmiendas A1, A2, A3.

Subtareas (dinero, políticas y consentimiento: prueba primero):
- [x] 1.1 Money, Rate y cotización FX explícita, VirtualInstant y RealInstant, errores de dominio (VC1).
- [x] 1.2 ReasonCode, cotizaciones y PolicyEngine de matrícula con orden de selección (VC2).
- [x] 1.3 Invariantes de caja y proyección por moneda (T4, N07 y N08).
- [x] 1.4 Consentimiento: JSON canónico, huella, Approval, alcance A3 y cambios materiales (VC3).
- [x] 1.5 Mandato permanente con período móvil y política de remesas (A1, N05 y N17).
- [x] 1.6 Máquinas de estado: PaymentPlan, PaymentAttempt (matrícula y remesa) y RefundClaim; estado visible.
- [x] 1.7 Cuenta: retenciones que se capturan o liberan una sola vez y reserva consumida primero.
- [x] 1.8 Devoluciones: exceso verificado y destino fijo (A2).
- [x] 1.9 Escenarios como configuración tipada (sección 6) y `db:seed-check` real.
- [x] 1.10 Prueba de arquitectura (VC1).
- [x] 1.11 `pnpm verify`, revisión VC1 a VC3, correcciones, merge a `main` y `smoke`.

Revisión (18:35, subagente `revisor`, docs/reviews/VC1.md, VC2.md y VC3.md): VC1 y VC2 aprobados con observaciones (solo hallazgos bajos). VC3 requería correcciones: VC3-1 alto (`Approval.grant` no amarraba sujeto, versión, vigencia, máximo y reserva al payload firmado) y VC3-2 a VC3-5 medios. Sin críticos, así que no corresponde segunda ronda. Se corrigieron el alto, los medios y los bajos, con 21 pruebas nuevas.

Evidencia de cierre (18:37): `pnpm verify` exit 0: typecheck, lint, 12 archivos y 380 pruebas, `db:seed-check` con 5 escenarios válidos y build (`verify: TODO EN VERDE`).

Evidencia (18:17): `pnpm verify` exit 0: typecheck, lint, 12 archivos y 359 pruebas, `db:seed-check` (base: 48 h B USD 2860.00 y 6 h D USD 2880.00; deadline_impossible sin ruta; arrival_remittance R1 USD 288.00) y build. Prueba de arquitectura verificada con una mutación temporal (detectó `pg`, `parseFloat` y `Number(`). Commits f057545, 2636caa y e033135. Comprobado: el push a `dev` crea un Preview (`dev:preview:READY`).

## Fase 2: Persistencia y ejecución (puerta G1)

Inicio: domingo 18, 18:20. Secciones: BUILD_PROMPT 8.3 a 8.6, 10, 11 (idempotencia), 12, 16.2 (N01), 16.3 (O01 a O08).

Subtareas:
- [x] 2.1 Esquema Drizzle completo, migración generada y aplicada en Neon dev; VC5 (esquema vacío y existente).
- [x] 2.2 Puertos de repositorios y unidad de trabajo; repositorios Drizzle con bloqueo en orden cuenta, obligación (o remesa) y plan.
- [x] 2.3 Creación de espacios por escenario (actores, cuentas, reserva, política, destinatarios, obligación, beca, gastos, mandato e historial).
- [x] 2.4 Proveedor simulado (cotizaciones, recotización, envío idempotente, respuesta perdida, eventos) e institución simulada (acreditación, libro, devoluciones).
- [x] 2.5 Reloj virtual y fallas inyectables con evento FAULT_INJECTED.
- [x] 2.6 Casos de uso de T1: planificar, comparar, pedir aprobación, aprobar, ejecutar (transaccional e idempotente) y conciliar; estado con procedencia.
- [x] 2.7 Bitácora de eventos redactada y secuencia por espacio.
- [x] 2.8 Pruebas de integración N01 y O01 a O08 (O06 requiere el agente: se cubre en la Fase 5).
- [x] 2.9 `pnpm verify`, revisión VC4 y VC5, correcciones, merge a `main` y smoke.

Revisión (19:06 a 19:21, subagente `revisor`, docs/reviews/VC4.md y VC5.md): VC4 requería correcciones. VC4-1 alto: el simulador volvía a entregar a la universidad ante un reenvío con la misma clave, y el libro quedaba duplicado. VC4-2 alto: conciliar un intento en SUBMITTING lo reenviaba durante el envío original y lo dejaba UNKNOWN sin motivo. VC4-3 a VC4-5 medios: la red de seguridad del índice único no veía el código envuelto por Drizzle, la redacción alteraba ids y O03 a O05 no miraban el lado del proveedor. VC4-6 y VC4-7 bajos. Sin críticos, así que no corresponde segunda ronda. VC5 aprobado con una observación baja. Todo se corrigió con pruebas: simulador idempotente con índice único del libro (migración `0001`), permiso de envío de 30 s, solo un timeout lleva a UNKNOWN, `DuplicateRecordError`, redacción que conserva identificadores, PROVIDER_SUBMIT_SENT registrado después del envío y migración probada sobre un esquema sembrado en la versión anterior. Decisión DEC-015: lo que bloquea un intento nuevo es el estado de la obligación, no un intento CREDITED (S03).

Evidencia de cierre (19:46): `pnpm verify` exit 0: `OK typecheck`, `OK lint`, `OK test` (17 archivos y 411 pruebas), `OK db:seed-check` (5 escenarios válidos) y `OK build`, `verify: TODO EN VERDE`. Antes, solo la suite de integración: 9 archivos y 42 pruebas en verde (237 s). En la rama `dev` de Neon se borraron las 6 filas duplicadas del libro antes de migrar; `db:migrate` en `dev`: "OK, 2 migraciones registradas".

Producción (19:47): merge fast-forward de `dev` a `main` (`d7cc287`); el build de Vercel aplicó la migración `0001` en `production` y quedó `main:production:READY`. `pnpm smoke --base-url https://arrivalguard.vercel.app`: `GET /api/health -> 200 status=ok database=ok commit=d7cc287`, `GET / -> 200 simulation band=present`, `smoke: OK`. El smoke con T1 por HTTP llega con la Fase 3, que es la que agrega las rutas.

Evidencia (19:05): `pnpm verify` exit 0 con 16 archivos y 403 pruebas. Integración contra Neon dev: N01 (B, débito USD 2,860.00 una sola vez, CREDITED con recibo, saldo USD 2,140.00), idempotencia (misma clave devuelve el mismo intento; misma clave con otro contenido da IDEMPOTENCY_CONFLICT), O01, O02a (USD 2,865.00 y saldo USD 2,135.00), O02b (EXCEEDS_PAYER_MAX, plan READY_FOR_APPROVAL, aprobación INVALIDATED, ningún intento), O03 (UNKNOWN, ActiveAttemptExists ante otro pago y un solo débito tras conciliar), O04 (dos ejecuciones concurrentes reales: un solo intento y un solo débito; misma clave en paralelo: mismo intento), O05 (DUPLICATE_EVENT_IGNORED, saldo intacto), O07 (HOLD_RELEASED una vez, reintento con aprobación nueva), O08 (PENDING_UNIVERSITY hasta 24 h más 36 h, sin recibo inventado), N02, N10, D05 (versión 2 con D, aprobación anterior invalidada, saldo final USD 2,120.00), el intento persistido antes de enviar (proveedor espía) y VC5 (29 tablas y 3 índices parciales sobre un esquema vacío; la base existente se vuelve a migrar sin perder datos). Puerta G1: T1 de punta a punta en modo estructurado, con respuesta perdida y concurrencia, demostrada a nivel de caso de uso. O06 (IA no disponible) se cubre en la Fase 5.

Cambio de diseño por concurrencia: ninguna transacción consulta a los simuladores mientras retiene conexión y bloqueos (se consultan antes de abrirla). Las pruebas de integración corren en paralelo (cada una en su espacio): de 319 s a 71 s. Fijada la región `iad1` de Vercel, igual a la de Neon (`us-east-1`).

## Fase 3: API, sesiones y acceso

Inicio: domingo 18, 19:08. Secciones: BUILD_PROMPT 4.3, 9.3, 11, 13.6 (límites), 14.1 y 14.2 (S03, S06 a S09), A4.

Subtareas:
- [x] 3.1 Sesiones: token de 256 bits, hash HMAC-SHA256 con pepper, 14 días, revocación; cookies ag_student, ag_payer y ag_evaluator (HttpOnly, Secure, SameSite=Strict).
- [x] 3.2 Acceso del jurado: código de evaluación, espacio con los tres roles, límites 20 por hora por IP con hash y 200 por día.
- [x] 3.3 Envoltorio HTTP: actor de sesión con x-ag-actor, Origin, Content-Type, Zod, requestId y httpErrorMapper único.
- [x] 3.4 DTO y Mapper de salida (CaseViewDTO, PlanDTO, ApprovalViewDTO, AttemptDTO, CashProjectionDTO, eventos).
- [x] 3.5 T6: cambio de política del pagador, cambios preparados con confirmación fija, revocación (N11, N12 en los dos órdenes).
- [x] 3.6 Rutas de la sección 11 para T1, T2, T5, T6 y la consola del evaluador (22 rutas en el build). `/api/chat` llega en la Fase 5; remesas, devoluciones y evidencia, en la Fase 6.
- [x] 3.7 Pruebas de API: T1 completa por HTTP, S03, S06, S07, S08, S09, cookies, Origin y límites.
- [x] 3.8 `smoke` con T1 en modo estructurado y CREDITED; `pnpm verify`, revisión VC6, merge a `main` y smoke en producción.

Revisión (19:56 a 20:15, subagente `auditor-seguridad`, docs/reviews/VC6.md): 39 ataques propios, 11 comprobaciones HTTP y 390 sesiones revisadas; sin críticos ni altos. Medios: el mensaje de revocación afirmaba un envío sin intento (VC6-1) y faltaban pruebas propias de los criterios de VC6 (VC6-2). Bajos: Origin confiaba en `X-Forwarded-Host`, cookie mal codificada daba 500, vencimiento de sesión mal informado, vista de aprobación abierta al estudiante, reinicio sin límite por IP y sin revocación de sesiones. Todo corregido con pruebas (`tests/security/sessionAuthority.test.ts`, 12 pruebas, y la de revocación en `t6Api`), más `x-ag-workspace` contra pestañas de otro espacio y `POST /api/session/logout`.

Evidencia de cierre (20:37): `pnpm verify` exit 0: `OK typecheck`, `OK lint`, `OK test` (22 archivos y 442 pruebas), `OK db:seed-check` (5 escenarios válidos) y `OK build`, `verify: TODO EN VERDE`.

Producción (20:39): merge fast-forward a `main` (`0eee748`), `main:production:READY`. `pnpm smoke --base-url https://arrivalguard.vercel.app`: `GET /api/health -> 200 status=ok database=ok commit=0eee748`, `GET / -> 200 simulation band=present`, acceso con el código de evaluación 201, plan con ruta B, solicitud, vista del pagador con huella, aprobación 201, `POST /api/payments` 201 PENDING_UNIVERSITY con débito USD 286000 (unidades menores), reloj +24 h, `reconcile -> 200 status=CREDITED`, `GET /api/case` con saldo 214000, `smoke: OK (T1 CREDITED)`.

Evidencia (19:50): pruebas de API y seguridad, 6 archivos y 23 pruebas en verde (acceso A4 con cookies y límites, CSRF, T1 por HTTP con O03, T4 y T5, N11, N12 en los dos órdenes, cambio preparado con confirmación fija, S03, S06, S07, S08, S09 y que ninguna ruta acepte "acreditado" o "aprobado" del navegador). `scripts/smoke.ts` ahora corre T1 por HTTP como el navegador (cookies, Origin, `x-ag-actor`, `Idempotency-Key`) y exige CREDITED. Contra `pnpm start` local: 9 pasos OK, `POST /api/payments/{id}/reconcile -> 200 status=CREDITED`, `GET /api/case -> 200 balance minor=214000`, `smoke: OK (T1 CREDITED)`.

## Fase 4: Interfaz

Inicio: domingo 18, 19:58 (en paralelo con la revisión VC6). Secciones: UI_UX_PROMPT completo (manda en lo visual), DESIGN_PLAN 2 a 6, BUILD_PROMPT 11 (contratos de la API).

Subtareas:
- [x] 4.1 Marca: ThresholdMark, Logo, ConsentSeal determinista (vector de prueba de DESIGN_PLAN 4.2), MiniSeal, SimulationBand, octágono; SVG en `public/brand`.
- [x] 4.2 Primitivas reestilizadas con los tokens (Button, Input, Field, Select, Switch, Tabs, Sheet, Panel, Skeleton, Toaster).
- [x] 4.3 Finanzas: MoneyFigure, StatusPill, reasonCopy (UI_UX 9.5), RouteBoard, JourneyLine, FundsBar, CashProjection, ConditionalIncomeCard, PermissionMeter, BlockedNotice, ApprovalRequestCard.
- [x] 4.4 Capa de datos del cliente (`x-ag-actor`, errores tipados, sondeo) y layout: TopBar con color de rol, RoleSwitcher accesible, VirtualClock, selector de tema sin parpadeo.
- [x] 4.5 Pantallas: landing con acceso del jurado, espacio de Sofía (zona A con modo estructurado, zona B con el estado del servidor), vista de Carlos (solicitudes, actividad, permisos con edición y revocación), documento de aprobación con sello, confirmación de cambios y consola del evaluador (escenario, reloj, fallas y bitácora).
- [x] 4.6 `/system` (P1) con tokens, tipografía, componentes y sellos.
- [x] 4.7 VC7: `pnpm ui:check` (Playwright) recorre T1 solo con clics hasta CREDITED; capturas a 1440 × 900 y 390 × 844 en claro y oscuro en `docs/design/screens/`; axe por pantalla en `docs/evidence/ui-axe.json`.
- [x] 4.8 `pnpm verify`, revisión VC7 con las capturas y correcciones. El merge a `main` va junto con la Fase 5 (ver Estado actual).

Revisión (20:59 a 21:19, subagente `revisor`, docs/reviews/VC7.md): rechazado por un alto, sin críticos. VC7-1 alto: tras una falla confirmada, el documento mostraba la aprobación consumida como vigente y no dejaba aprobar de nuevo. Ocho medios: clave de la interfaz sin la aprobación, avisos que contradecían al servidor, titular del tablero sin ruta, replan con la matrícula pagada, caja desactualizada, documento que no avisaba de un cambio, capturas incompletas del documento, faltantes P0 de la consola y promesas P1 en la landing. Siete bajos. Corregido todo lo que afecta corrección o el spec, con pruebas (integración de VC7-1 y del replan rechazado, unitaria del titular del tablero) y `ui:check` más estricto. Decisión DEC-016. Pendientes menores en la Deuda.

Evidencia de cierre (21:48): `pnpm verify` exit 0: `OK typecheck`, `OK lint`, `OK test` (31 archivos y 487 pruebas), `OK db:seed-check`, `OK build`, `verify: TODO EN VERDE` (el árbol incluye el agente de la Fase 5).

Evidencia (21:34): `pnpm ui:check` contra `pnpm build && pnpm start`: T1 solo con clics hasta CREDITED con "Check this payment" pulsado mientras espera la universidad; `axe: 34 capturas revisadas, 0 violaciones serias o críticas`; `scroll horizontal: ninguno`; `ui:check: OK`.

Evidencia (20:51): `pnpm ui:check --base-url http://localhost:3000` contra `pnpm build && pnpm start`: landing, acceso con el código (escenario base), Plan my payment (ruta B), Request approval, Carlos abre la solicitud y aprueba (aparece el sello), Sofía envía, el evaluador avanza 24 horas y Check this payment llega a CREDITED, todo con clics; `axe: 34 capturas revisadas, 0 violaciones serias o críticas`; `scroll horizontal: ninguno`; `ui:check: OK (T1 CREDITED solo con clics)`. Capturas en `docs/design/screens/` (landing, /system, estudiante vacío, esperando y acreditado, documento pendiente y aprobado, vista del pagador y consola), a 1440 × 900 y 390 × 844, en claro y oscuro (la consola solo en oscuro). Revisadas a ojo: se corrigieron el desborde horizontal de la consola en móvil, la bitácora sin día después de avanzar el reloj, textos duplicados en fondos y beca, la tarjeta invalidada con opacidad (no cumplía 4.5:1) y pestañas con `aria-controls` sin panel.

`pnpm verify` (20:51 a 20:57): exit 0, 25 archivos y 460 pruebas (incluye las unitarias de la interfaz: geometría del sello con el vector de DESIGN_PLAN 4.2, textos de razones de UI_UX 9.5, hora virtual y montos del pagador sin punto flotante).

Cambios de API para la interfaz (aditivos): `SessionDTO` agrega `virtualStart` y `people` (nombres sintéticos para el selector de rol); `PlanDTO` agrega `targetArrivalHours` y `comparedAt` (sacados de las cotizaciones evaluadas).

## Fase 5: Agente (puerta G2)

Inicio: domingo 18, 21:00 (en paralelo con la revisión VC7). Secciones: BUILD_PROMPT 13 (13.1 a 13.6), 14.1 (texto del modelo), 14.2 (S01, S02, S04, S05, S10 a S13 de nivel agente), A5.

Subtareas:
- [x] 5.1 Puertos del agente (modelo, herramientas, conversación, uso de IA) y `ChatTurnUseCase`: el actor sale de la sesión; `<case_state>` compacto, enmascarado y por rol; hasta 4 llamadas al modelo y 6 herramientas por turno; no se empieza otra llamada pasados 30 s (25 s por llamada, `maxDuration` de 60 s).
- [x] 5.2 Adaptador de Claude con la configuración 13.1 (thinking between_tools con effort low, system con cache_control, herramientas strict, tool_choice auto) y el system prompt literal de 13.4.
- [x] 5.3 Herramientas por rol (13.3) con Zod en el servidor; nunca hay herramientas para aprobar, confirmar, destinatarios, reloj, fallas ni acreditar; una herramienta ajena al rol da ROLE_NOT_ALLOWED y SECURITY_BLOCK (PRIVILEGE_ESCALATION). La clave del envío por el agente la deriva el servidor (`tuition:{planId}:v{version}:{approvalId}`).
- [x] 5.4 Historial A5 (pasados como texto plano, turno en curso literal) en `conversations` y `conversation_turns`; presupuesto con reserva previa en `ai_usage` (3.00 USD por espacio, 15.00 USD diarios), 10 turnos por minuto y 60 por día; salida segura (AI_UNAVAILABLE, tope, error de la API, rechazo) con AI_FALLBACK_ACTIVATED y modo estructurado.
- [x] 5.5 Señales de ataque en el mensaje (inducción, aprobación afirmada sin aprobación real, cambio de reglas, secretos, número completo) como SECURITY_BLOCK con su categoría oficial. El control real es estructural.
- [x] 5.6 Interfaz del chat: hilo, actividad del servidor, sugerencias, compositor, tarjetas desde el estado del servidor, texto del modelo como markdown mínimo sin HTML, modo estructurado ante una falla; `GET` y `POST /api/chat`; "AI usage" en la consola.
- [x] 5.7 `pnpm verify`, revisión VC8, correcciones, merge a `main`, smoke y T1 por chat en producción (G2).

Revisión (21:50 a 22:12, subagente `revisor`, docs/reviews/VC8.md): aprobado con deuda, sin críticos ni altos. VC8-1 medio: presupuesto superable con turnos simultáneos (corregido con reserva atómica bajo advisory locks). VC8-2 medio: el texto de turnos pasados viajaba sin escapar (corregido). VC8-3 medio: falsos positivos de las señales en preguntas normales (corregido). Bajos: timeout con costo 0, eventos antes del límite, pruebas débiles, `ai-turns` sin estado de T1 del servidor y plazo del turno (corregidos); mapeos dentro del caso de uso (Deuda). Pruebas nuevas en `chatTurn.test.ts` y `securitySignals.test.ts`.

Evidencia (21:20): `pnpm ai:turns` con el modelo real contra Neon `dev`: 20 turnos seguidos, 0 con error del modelo; T1 por chat hasta CREDITED (recibo AU-RC-BC49EF68) con la aprobación dada en la pantalla fija; ataques S01, S10, S13 y S05 con SECURITY_BLOCK; el pagador prepara un cambio de límite que queda pendiente de confirmación (`docs/evidence/agent-turns-2026-10-19T02-20-43-194Z.json`). Integración con modelo guionizado (`tests/integration/chatTurn.test.ts`, 8 pruebas): actor de la sesión, historial A5, escalada rechazada sin efectos, ids de otro espacio, reintento sin pago doble, topes 4 y 6, O06 con AI_UNAVAILABLE, presupuesto, error de la API y rechazo.

## Fase 6: Capacidades P1

Inicio: domingo 18, 21:52. Secciones: BUILD_PROMPT 7 (T3, T4, T7), 8.4 (aprobación puntual de remesas), 8.5, 11 (rutas de remesas, devoluciones y evidencia), 16.2 (N05, N13, N14, N17, N18), 16.6, enmiendas A1 y A2.

Subtareas:
- [x] 6.1 Remesas (T3, A1): preparar (rutas a la cuenta local verificada; dentro del tope del permiso queda lista, fuera escala al pagador; destinatario no abierto o no verificado bloquea), ejecutar con Idempotency-Key volviendo a autorizar bajo bloqueo (encadenar remesas no supera el tope), aprobación puntual del pagador con huella, entrega una sola vez a la cuenta local al cumplirse la llegada, reserva de llegada consumida primero y notificación al pagador.
- [x] 6.2 Devoluciones (T7, A2): reclamo por el exceso verificado contra el libro de la institución, destino fijo en la cuenta de origen, envío idempotente y seguimiento hasta REFUNDED (abono de la liquidación una sola vez) al avanzar la hora virtual.
- [x] 6.3 Rutas: `POST /api/remittances`, `/api/remittances/{id}/execute`, `/api/remittances/{id}/view` y `/approve` (solo payer), `POST /api/refund-claims` y `/api/refund-claims/{id}/submit`, `GET /api/evidence` (JSON y `?format=md`).
- [x] 6.4 Herramientas del agente: `prepare_remittance` (un `recipient_id` ajeno da RECIPIENT_NOT_VERIFIED y SECURITY_BLOCK), `execute_remittance`, `prepare_refund_claim` y `submit_refund_claim`, con claves derivadas por el servidor; remesas y devoluciones en `<case_state>`.
- [x] 6.5 Interfaz: transferencias y devolución en la zona B, "Send transfer" y "Submit refund request" en el modo estructurado, aprobación puntual de transferencias en la vista de Carlos, actividad del pagador, tarjetas en el chat y expediente de evidencia en una hoja lateral con descarga JSON y Markdown.
- [x] 6.6 `pnpm verify`, merge a `main` y smoke.

Cierre conjunto de las Fases 4, 5 y 6 (22:25 a 22:34): `pnpm verify` exit 0 (`OK typecheck`, `OK lint`, `OK test` con 34 archivos y 509 pruebas, `OK db:seed-check`, `OK build`, `OK secrets-scan`, `verify: TODO EN VERDE`). `pnpm ui:check` contra el build local: T1 con clics y una transferencia con clics, 38 capturas, 0 violaciones de axe, sin scroll horizontal y sin violaciones de CSP. Commit `b3e351c`, merge fast-forward a `main`, `main:production:READY`. `pnpm smoke --base-url https://arrivalguard.vercel.app` (22:33): `commit=b3e351c`, T1 por HTTP hasta `status=CREDITED` y saldo 214000, `smoke: OK (T1 CREDITED)`; la respuesta trae `Content-Security-Policy` con nonce.

**Puerta G2 (22:34):** `pnpm smoke:chat --base-url https://arrivalguard.vercel.app` con el modelo real en producción: el primer mensaje de Sofía planifica la ruta B y pide la aprobación (herramientas compare_routes, project_cash, plan_tuition_payment y request_payer_approval, 9.3 s); Carlos aprueba en su pantalla fija (201); "Send the payment now" ejecuta (execute_approved_payment, 5.2 s); el evaluador avanza 24 h; "Has the university received my payment?" responde con el recibo; `T1 (servidor): CREDITED AU-RC-8555B526`, `smoke:chat: OK (T1 CREDITED por chat)`. Evidencia: `docs/evidence/g2-chat-2026-10-19T03-34-06-061Z.json` (commit b3e351c).

Evidencia (22:00 a 22:15): integración `tests/integration/remittanceRefund.test.ts` (6 pruebas): N05 (R1 USD 288.00 sin aprobación nueva, reserva USD 1,512.00, entrega única de CNY 2,000.00), N17 (720 > 600 escala; solo el pagador aprueba con su huella; se ejecuta una vez), encadenar tres remesas listas (la tercera escala), N18 (RECIPIENT_ACCOUNT_NOT_OPEN sin intento), N13 (CNY 500.00, REFUNDED con USD 70.00, saldo USD 2,210.00) y N14 (sin exceso, sin reclamo). API `tests/api/p1Api.test.ts` (4 pruebas): T3 por HTTP con aprobación puntual, S15 por HTTP, S14 por HTTP con REFUNDED y el expediente sin secretos con claves recortadas. Agente `chatTurn.test.ts` (3 pruebas P1): remesa por chat sin envío doble, S15 por chat y reclamo por chat. `pnpm ui:check`: T1 con clics y una transferencia de CNY 2,000 con clics hasta "Accepted by provider"; `axe: 38 capturas, 0 violaciones serias o críticas`; sin scroll horizontal; consola sin violaciones de CSP.

Adelantado de la Fase 7: CSP con nonce (`src/proxy.ts`, DEC-017) y `scripts/secrets-scan.ts` (329 archivos y los valores reales del entorno, sin imprimirlos) como último paso de `pnpm verify`.

## Fase 7: Seguridad completa (puerta G3)

Inicio: domingo 18, 22:36. Secciones: BUILD_PROMPT 14.1 y 14.2 (S01 a S16), AUTONOMIA 6 (VC9).

Subtareas:
- [x] 7.1 S01 a S16 con su categoría oficial y efectos en la base, a nivel API (y herramienta del agente donde corresponde), en `tests/security` (`officialSuite.test.ts` con S01, S02, S04, S05 y S10 a S16; S03 y S06 a S09 en `apiSecurity.test.ts`), commit `31c3952`.
- [x] 7.2 Encabezados: CSP con nonce (DEC-017), `frame-ancestors 'none'`, nosniff, Referrer-Policy, X-Frame-Options y Permissions-Policy.
- [x] 7.3 `secrets-scan` en `pnpm verify`.
- [x] 7.4 Revisión VC9 (`auditor-seguridad`): las cuatro categorías contra la API y el agente en local; cada falla, primero prueba de regresión y después corrección. Primera ronda: 1 crítico (VC9-1) y 6 bajos, corregidos en `1bb4890`. Segunda ronda: las correcciones resisten, sin críticos, altos ni medios; 5 bajos más, también corregidos con su prueba (docs/reviews/VC9.md).
- [x] 7.5 `pnpm verify`, merge a `main` y smoke.

Cierre (lun 00:28): `pnpm verify` sobre `82e72e5` exit 0 (`OK typecheck`, `OK lint`, `OK test` con 39 archivos y 546 pruebas, `OK db:seed-check`, `OK build`, `OK secrets-scan`). Merge fast-forward de `dev` a `main` (`b3e351c..82e72e5`). `GET /api/health` en producción: `82e72e5 ok ok`. `pnpm smoke --base-url https://arrivalguard.vercel.app`: `commit=82e72e5`, acceso 201, plan con ruta B, aprobación 201, pago 201 PENDING_UNIVERSITY, reloj +24 h, `reconcile -> 200 status=CREDITED`, saldo 214000, `smoke: OK (T1 CREDITED)`. **Puerta G3 cumplida:** S01 a S16 en verde con su categoría oficial (`tests/security`), CSP y encabezados, `secrets-scan` en `verify` y VC9 sin críticos ni altos abiertos. Un intento previo de `verify` (`6bffc17`) falló en 1 de 546 pruebas: la del tope por origen de Run T1 to T8 dependía del reloj por el intervalo entre corridas; se corrigió la prueba aislando ese intervalo (que tiene su propia prueba de 60 s), sin cambiar ninguna aserción (`82e72e5`).

## Fase 8: Evaluación y documentos (puerta G4)

Inicio: lunes 19, 00:30. Secciones: BUILD_PROMPT 16 y 18, AUTONOMIA 6 (VC10).

Subtareas:
- [x] 8.1 Corridas oficiales finales sobre `75614ed`, el commit desplegado. `tasks:run` contra producción (01:29): 8 de 8, con T8 comprobando la acción ofrecida y guardando su transcripción, y Run T1 to T8 de la consola 8 de 8 en 4.0 s. `eval:deterministic` (08:43 a 08:53): 114 de 114 con 40 escenarios. `eval:agent` (08:53 a 09:11, solo, sin compartir la base con otra corrida): 32 de 32, incluidos S14 y S15 con el modelo real; mediana de 1 turno con 6 de 6 casos normales medidos por el estado del servidor, 0 preguntas de más en 7 pedidos completos, 3 de 3 correcciones, 0 salidas seguras, mediana de 18.4 s por turno y USD 0.47. Corridas anteriores, que también quedan publicadas: `tasks:run` contra producción (`82e72e5`, 00:29): 8 de 8 tareas y Run T1 to T8 de la consola 8 de 8 en 3.9 s. Sobre `82e72e5`: `eval:deterministic` 114 de 114 y `eval:agent` 27 de 28 (D02 marcado por un juez que solo contaba signos de pregunta; la respuesta pedía los dos datos en un mensaje). Juez corregido y documentado en EVALUATION, con N06, N15 y N16 agregados. Sobre `1235212` (mismo `src` que producción): `eval:deterministic` 114 de 114 con 40 escenarios y `eval:agent` 30 de 30 (USD 0.455, 0 salidas seguras, mediana de 15.8 s por turno). Las tres corridas del agente quedan publicadas.
- [x] 8.2 `results:report` final (09:12) con las corridas de `75614ed`; la primera versión fue a las 00:57: RESULTS.md, EVALUATION 7.1 a 7.3 y las cuatro categorías de SECURITY_SELF_ASSESSMENT, con commit y fecha de cada archivo (`c2377ca`).
- [x] 8.3 Documentos de la sección 18: README, TECHNICAL, SECURITY_SELF_ASSESSMENT, EVALUATION, EXECUTION_EVIDENCE, DEMO_GUIDE, VIDEO_SCRIPT, PITCH_OUTLINE, LICENSE y THIRD_PARTY_LICENSES (`4580baf`, al día con VC9).
- [x] 8.4 `ui:check` completo (01:01): T1 con clics hasta CREDITED, Run T1 to T8 desde la consola 8 de 8, transferencia con clics, 39 capturas, 0 violaciones serias o críticas de axe, sin scroll horizontal y sin errores de CSP.
- [x] 8.5 Revisión VC10 (`revisor`, 00:58 a 01:11): aprobado con deuda. Las 78 filas generadas coinciden sin diferencias con sus JSON. Hubo 4 medios y 8 bajos, sin críticos ni altos, todos corregidos en `75614ed` antes de la corrida oficial final (docs/reviews/VC10.md).
- [x] 8.6 `pnpm verify`, merge, smoke y aviso del video final en PARA_HUMANOS (09:15).
- [x] 8.7 (pedido de los humanos, 09:20) Botón de tema (sistema, claro y oscuro) también en el inicio, en las pantallas fijas del pagador y en `/system`. Antes solo estaba dentro del espacio. La consola sigue siempre oscura (UI_UX 11.5) y por eso no lo muestra. En el teléfono, el botón "Open the demo" de la barra queda solo en el hero para que la barra no se desborde. `ui:check` lo prueba: claro, oscuro, se recuerda al recargar y vuelve a sistema. Commit `b7f997a`.

Cierre (lun 09:50):
- `pnpm verify` sobre `b7f997a`, exit 0: `OK typecheck`, `OK lint`, `OK test` con 39 archivos y 546 pruebas, `OK db:seed-check`, `OK build` y `OK secrets-scan`.
- `ui:check` (09:35): todos los pasos OK, 39 capturas, 0 violaciones serias o críticas de axe, sin scroll horizontal y sin errores de CSP.
- Merge fast-forward a `main` y `GET /api/health` en producción: `b7f997a ok ok`. El inicio de producción trae `aria-label="Theme: System. Switch to Light"`.
- `pnpm smoke --base-url https://arrivalguard.vercel.app`: `commit=b7f997a`, `reconcile -> 200 status=CREDITED`, `smoke: OK (T1 CREDITED)`.
- `pnpm tasks:run` final contra producción sobre `b7f997a`: 8 de 8, y Run T1 to T8 de la consola 8 de 8 en 4.0 s (`docs/results/tasks-2026-10-19T14-46-39-971Z.json`).
- `results:report` con las corridas finales:
  - deterministic `75614ed`: 114 de 114 pruebas y 40 escenarios;
  - agent `75614ed`: 32 de 32;
  - tasks `b7f997a`: 8 de 8.
  EVALUATION declara que `b7f997a` solo cambia los cinco archivos de interfaz del botón de tema.

**Puerta G4 cumplida:** documentos con resultados reales, revisados por VC10, y aviso del video final escrito en PARA_HUMANOS.

## Fase 9: Cierre (puerta G5)

Inicio: lunes 19, 09:50. Secciones: AUTONOMIA 6 (VC11) y 11.

Subtareas:
- [x] 9.1 Revisión VC11 (`revisor`). La primera ronda no fue concluyente: la regla de permisos impide copiar `.env.local` y no se buscó otra vía. Encontró 1 medio (`smoke` sin `--code`) y 1 bajo (comandos de Windows). Al repetir la instalación con un Postgres local apareció un paso oculto (medio): los límites de las pruebas. Los tres se corrigieron en `cdc16aa` y `a82ff77`. Segunda ronda en un clon limpio con Postgres local y valores propios, sin secretos: `pnpm install`, `db:migrate`, `pnpm test` (546 de 546), `secrets-scan` y `db:seed-check`, todos en exit 0. Aprobado.
- [x] 9.2 `pnpm verify` sobre `a82ff77` (10:01 a 10:11), exit 0: 39 archivos y 546 pruebas, y `secrets-scan` con los 5 valores reales del entorno, sin secretos. Merge a `main` y `GET /api/health`: `d8513f7 ok ok`. `pnpm smoke --base-url https://arrivalguard.vercel.app` (10:12): `commit=d8513f7`, acceso 201, `reconcile -> 200 status=CREDITED`, saldo 214000, `smoke: OK (T1 CREDITED)`.
- [x] 9.3 `docs/INFORME_FINAL.md`. Sus tablas N, O, S, D y T se generaron desde `docs/results/`. PARA_HUMANOS tiene lo que deben hacer antes del cierre oficial (martes 20, 10:59 Lima).
- [x] 9.4 Tags en origin.
  - `v1.0.0-submission` sobre `ed1ed75` (10:26): queda como historia y fue reemplazado (DEC-021).
  - `v1.0.1-submission`, la entrega, sobre el commit que agrega el cierre al código `172676b`. Antes de crearlo, en la conversación, se comprueban `pnpm verify` sobre ese commit, el despliegue, el smoke y `git ls-remote --tags origin`. El árbol queda limpio.

Reverificación en esta sesión (lun 10:33 a 10:59). `pnpm verify` se volvió a correr sobre el commit de cierre de las Fases 0 a 6: checkout temporal en el mismo directorio, `pnpm install --frozen-lockfile` de esa versión, `.next` borrado y vuelta a `dev`. Todos con exit 0 y `verify: TODO EN VERDE`:
- Fase 0 `cf4e5a1`: 7 de 7.
- Fase 1 `ae1fc7b`: 380 de 380.
- Fase 2 `d7cc287`: 411 de 411.
- Fase 3 `0eee748`: 442 de 442.
- Fase 4 `a3304a1`: 487 de 487.
- Fases 5 y 6 `b3e351c`: 509 de 509.

Las Fases 7, 8 y 9 tienen su `verify` en esta sesión sobre `82e72e5`, `b7f997a` y `ed1ed75`.

Hallazgo posterior al tag (lun 11:00 a 11:40). Al reinstalar desde cero con el entorno real (VC11), `pnpm test` dio 545 de 546. La falla fue "una sola corrida empieza por intervalo". El limitador usa ventanas fijas: dos inicios de Run T1 to T8 separados por milisegundos, pero a ambos lados de un cambio de minuto, empezaban los dos. Es un error real y de severidad baja, sin efecto en dinero ni seguridad. Se corrigió primero con una prueba que reproduce el borde, con un reloj propio del limitador porque las pruebas corren en paralelo. La corrección usa dos grillas de ventanas desplazadas. Va en `dc83650 y 59811ff` sobre `dev`: `pnpm verify` sobre `59811ff` (11:29 a 11:39) exit 0, con 547 de 547 pruebas y `secrets-scan` con los 5 valores reales. No se desplegó ni se movió el tag, porque no es una corrección crítica. Producción y `v1.0.0-submission` siguen en `ed1ed75`; la decisión de desplegarlo queda en PARA_HUMANOS.


Cierre con `v1.0.1-submission` (DEC-021). Hubo dos hallazgos más en la reinstalación con el entorno real (VC11, rondas 3 y 4):
- VC11-5, alto: el primer arreglo del intervalo, con dos grillas, creaba un bloqueo encadenado. Se reemplazó por `tryAcquire` atómico (`0610be8`).
- VC11-7, bajo: la lectura de la hora dependía de `DateStyle` (`172676b`).
Ambos se corrigieron con pruebas que fallaban antes. Corridas oficiales finales sobre `172676b`:
- `pnpm verify`: exit 0 con 549 de 549 pruebas.
- `eval:deterministic`: 117 de 117 pruebas en 40 escenarios.
- `eval:agent`: 32 de 32 escenarios.
- `tasks:run` contra producción: 8 de 8, y la consola 8 de 8.
- Smoke: CREDITED.

**Puerta G5 cumplida.** Las Fases 0 a 9 están cerradas y las puertas G1 a G5 cumplidas. Las revisiones VC1 a VC11 no dejan hallazgos críticos ni altos abiertos.

Comprobación de las 16:00 (lun 16:00 a 16:05, Lima). `v1.0.0-submission` y `v1.0.1-submission` están en `origin`. Producción sirve `bd12847` (`/api/health`: ok, base de datos ok), `pnpm smoke` contra producción termina en CREDITED y `secrets-scan` da OK.

Pasada de movimiento de marca (lunes por la tarde hasta las 20:50, DEC-022). La pidió el usuario después del congelamiento: "marca completa" y "producción más tag nuevo". Toca solo la interfaz: el diff contra `bd12847` en `src/domain`, `src/application`, `src/infrastructure`, `src/interfaces`, `src/app/api`, `src/proxy.ts` y `drizzle` sale vacío.
- **Qué:** tokens y keyframes en un solo lugar; las dos firmas, solo en vivo y una vez; las transiciones de estado de 120 a 180 ms; la vista guardada al cambiar de rol; el guion del tablero de la landing con el giro de letras (P2); la píldora móvil del tablero. Detalle en DEC-022.
- **Pruebas nuevas:** `motionTokens`, `stamps` y `resourceCache` (unitarias), y seis pasos de `ui:check` sobre el movimiento.
- **Revisión visual:** cuadros tomados con Playwright en mitad de cada animación, porque la extensión de Chrome no estaba conectada. Se corrigieron tres cosas que se vieron así:
  - 22 px de scroll horizontal del tablero a 390 px;
  - el monto del tablero se corría al cambiar el ancho de la píldora;
  - el menú de rol móvil no se cerraba con Escape ni al tocar fuera (ya pasaba antes).
  Además, el desplazamiento suave quedó solo en las anclas de la landing.
- **Entrega en producción (20:55 a 21:35):**
  - `pnpm verify` sobre `c18a91d`: exit 0 con 567 de 567 pruebas.
  - Fast-forward de `main`; `/api/health` da `c18a91d`.
  - Smoke en producción: CREDITED.
  - Tag `v1.0.2-submission`.
  - Luego, a pedido del usuario ("en producción debe estar lo más actualizado", DEC-023): `pnpm tasks:run` contra producción en `c18a91d` (21:28), 8 de 8 y la consola 8 de 8; `pnpm results:report`; y la entrega pasa a `v1.0.3-submission`, sobre el commit que agrega esa corrida.
- **Evidencia:**
  - `pnpm verify` (20:30 a 20:40): exit 0 con 567 de 567 pruebas.
  - `pnpm ui:check` contra `pnpm build && pnpm start` (20:44): todos los pasos OK, incluido Run T1 to T8 8 de 8; 39 capturas, 0 violaciones serias o críticas de axe, sin scroll horizontal y sin errores de CSP.

## Deuda

Hallazgos medios y bajos de las revisiones y pendientes menores.

- (Resuelto el domingo 18 a las 23:40) VC6: el límite por IP ahora usa `ipAddress()` de `@vercel/functions` antes que `X-Forwarded-For`, con prueba en `tests/unit/clientIp.test.ts`.
- VC7: que el documento de aprobación entre completo en 1440 × 900; indicador de cambios en las pestañas móviles; nombres de escenario leídos de la configuración del servidor en la landing. (La columna de estado del tablero de la landing en móvil quedó resuelta el lunes 19, DEC-022: la píldora va en su fila.)
- VC8: mapeos dentro de `ChatTurnUseCase` (turno a DTO, historial, tool_result, costo) a llevar a Mapper y servicio; la clave del agente se deriva en la capa de interfaz.
- Fase 6: el medidor del permiso no muestra los días que quedan del período. (El botón Evidence en móvil quedó resuelto el domingo 18 a las 23:35: en el teléfono es un ícono con su nombre accesible.)
- VC7: los enlaces a la guía de demo y al video, con DEMO_GUIDE (Fase 8) y el video de los humanos. ("Run T1 to T8" en la consola quedó resuelto en `1bb4890`, DEC-020.)

- VC11-8 (bajo, ya existía): la ranura global de Run T1 to T8 se ocupa antes de revisar los límites por espacio, por origen y diario; el orden es deliberado.

## Recortes

Lo que se recorta según AUTONOMIA 8, con su motivo. Se declara como no implementado en los documentos.

- Ninguno. Todos los P0 y P1 están terminados. De los P2 de BUILD_PROMPT 19, las animaciones se hicieron en `v1.0.2-submission` (DEC-022). Los demás no se implementaron y se declaran en `docs/INFORME_FINAL.md`, sección 6: invitaciones para dos dispositivos, E2E en CI, GitHub Actions, repetición triple, comparación con el flujo estructurado y streaming.
