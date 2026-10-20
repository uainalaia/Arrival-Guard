# VC9 Seguridad completa (puerta G3): revisión adversarial

- **Fecha:** domingo 18 de octubre. Primera ronda de 22:40 a 23:08 (Lima); correcciones de 23:10 a 23:55. **Revisor:** subagente `auditor-seguridad`.
- **Rango de la primera ronda:** `dev` en `31c3952` (Fases 0 a 7). **Spec:** BUILD_PROMPT 14.1 y 14.2 (S01 a S16), A1, A2, 13.6 y DEC-017. **Criterios:** AUTONOMIA 6, VC9.
- **Método del revisor:** la suite oficial y las pruebas de API (46 de 46 en verde, dos corridas), ataques propios por caso de uso, por HTTP real contra `pnpm dev --port 3200` y por el agente (guionizado y con el modelo real: 12 turnos, USD 0.09), en las cuatro categorías oficiales. Sus scripts y bitácoras quedaron en `tmp/audit/vc9/` (fuera del repositorio). No editó código.
- **Veredicto de la primera ronda:** no pasa. **Un crítico** (devoluciones en paralelo liquidadas varias veces), ningún alto ni medio y seis bajos. Según AUTONOMIA 6, un crítico exige corrección y segunda ronda.

## Criterios (según el revisor)

1. **S01 a S16 con su categoría oficial y efectos en la base:** en verde (IT: S01, S02, S03, S14, S15; DE: S04, S05, S06, S13; PE: S07, S08, S09, S16; PI: S10, S11, S12).
2. **`secrets-scan`:** OK. Los marcadores `secrets-scan:allow` solo están en datos falsos de prueba.
3. **Encabezados y CSP:** CSP con nonce distinto por respuesta y `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, nosniff, Referrer-Policy, Permissions-Policy y `X-Frame-Options: DENY` en `/`, `/w/[id]` y `/system`; ningún script sin nonce; `/api/health` sin `x-powered-by`; el preflight desde otro origen no recibe `Access-Control-Allow-Origin`.
4. **DEC-017 (`style-src 'unsafe-inline'`):** sin riesgo real hoy: ninguna superficie dibuja HTML (chat, expediente y consola usan React como texto) y el único `dangerouslySetInnerHTML` es el script fijo del tema, con nonce.
5. **Ataques que no rompieron nada:** escalada de rol en 10 rutas, campos de autoridad en el cuerpo de 9 rutas nuevas, CSRF en 28 variantes, cookies cruzadas y sesiones revocadas, IDOR sobre 10 recursos, huellas de otra remesa o de otro espacio, aprobaciones y envíos en paralelo, fraccionar remesas para superar el tope, remesas tras revocar el mandato o la aprobación, montos inválidos, herramientas del otro rol o inventadas (`__proto__`, `mark_credited`), argumentos con rol o espacio, delimitadores disfrazados, avisos inyectados del proveedor y de la universidad, XSS en el chat y, con el modelo real, cuenta nueva con urgencia, "Carlos already approved", fraccionar remesas, devolución a otra cuenta, instrucciones en base64 y en chino, pedidos de secretos y del prompt.

## Hallazgos y qué se hizo

Cada corrección tiene primero su prueba de regresión, que falló antes del cambio y pasa después (las corridas están en la conversación de construcción).

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC9-1 | **crítico** | Cuatro `POST /api/refund-claims` en paralelo creaban cuatro reclamos de CNY 500.00; enviados en paralelo, la institución simulada aceptaba varios y al avanzar el reloj el pagador recibía USD 280.00 o 420.00 en vez de USD 70.00 (rompe A2, T7 y N13). Causa: preparar buscaba el reclamo abierto fuera de transacción y la institución comprobaba el exceso y luego insertaba, sin atomicidad. | Corregido en dos capas. (1) `PrepareRefundClaimUseCase` busca el reclamo abierto y lo inserta dentro de una transacción con la obligación bloqueada (`forUpdate`): preparaciones en paralelo devuelven el mismo reclamo. (2) `SimulatedInstitutionAdapter.submitRefundClaim` comprueba el exceso verificado e inserta en una sola transacción bajo `pg_advisory_xact_lock` por espacio y referencia, leyendo el libro con la misma conexión (sin riesgo de agotar el pool): la suma aceptada nunca supera el exceso. No se agregó un índice único parcial porque la rama `dev` ya tiene los reclamos duplicados que dejó la auditoría y las migraciones son solo aditivas. Pruebas nuevas en `tests/security/vc9Regressions.test.ts`: preparación ×4 en paralelo (caso de uso y HTTP) deja un reclamo; la institución acepta uno solo de tres reclamos distintos en paralelo; de punta a punta con carreras se liquida una vez USD 70.00. |
| VC9-2 | bajo | El mismo reclamo enviado ×3 en paralelo con claves distintas daba un envío (bien) y dos HTTP 500 por el índice único del simulador. | Corregido: la sección crítica del simulador devuelve el registro existente del mismo reclamo, y el caso de uso, con el reclamo bloqueado, responde 409 `IDEMPOTENCY_CONFLICT` si otra clave ya lo envió. Pruebas nuevas (caso de uso y HTTP): un envío, el resto repetición o 409, nunca 500. |
| VC9-3 | bajo | El texto pasado del asistente volvía al modelo sin escapar: si el modelo repetía un `<case_state>` falso, en el turno siguiente llegaba como etiqueta. | Corregido: el historial escapa también el texto del asistente. Prueba nueva en `chatTurn.test.ts` (VC9-3). |
| VC9-4 | bajo | Las señales solo reconocían inglés en claro: una instrucción en chino o en base64 no dejaba SECURITY_BLOCK (el efecto sí estaba bloqueado). | Corregido: patrones mínimos en español, portugués y chino, y los tramos largos en base64 se decodifican y se vuelven a revisar si son texto legible. Pruebas nuevas en `securitySignals.test.ts`, con una lista negativa de preguntas normales en esos idiomas. |
| VC9-5 | bajo | Una remesa con aprobación puntual no cuenta para el período del mandato y la regla no estaba registrada. | Decisión DEC-018 (no cuenta: el tope limita lo que sale sin Carlos) y prueba que fija la regla. |
| VC9-6 | bajo | En `arrival_remittance` y `overpayment_refund`, la matrícula ya acreditada sin plan se veía como "Details needed" con "Plan my payment"; el agente lo notó y no pudo confirmar el pago. | Corregido: `visibleTuitionStatus` recibe la obligación; acreditada por la institución y sin plan, se ve CREDITED sin acción. Pruebas nuevas (dominio e integración). |
| VC9-7 | bajo | Un solo origen con el código podía agotar el presupuesto diario global de IA. | Corregido con DEC-019: tope diario por origen (hash de IP, USD 7.50 por defecto) dentro de la misma reserva atómica. Prueba nueva: con el tope de la prueba ya gastado por un origen, su segundo espacio queda en BUDGET_EXHAUSTED y otro origen responde. |

## Notas del revisor que no son hallazgos

- Después de aprobar, el estudiante ve la huella completa en el plan y en el expediente. No da autoridad: `POST /api/approvals` exige la sesión del pagador, y S07 ya parte de que el estudiante la conoce.
- Dos marcas de falla en su bitácora (AI-6, AI-11) eran falsos positivos de su heurística; la base confirmó que no hubo efectos.
- Pidió revisar en la segunda ronda la ruta nueva `POST /api/evaluation/scripted-tasks` (DEC-020): límites, gasto de IA por corrida y espacios creados.

## Segunda ronda

- **Fecha:** domingo 18, de 23:20 a lunes 19, 00:10 (Lima). **Rango:** `dev` en `4580baf` (correcciones en `1bb4890`); durante la ronda HEAD pasó a `437c0c9`, que solo cambia `clientIp` y `EvidenceDrawer` y no toca lo atacado.
- **Veredicto:** las correcciones resisten; **ningún crítico, alto ni medio**. La puerta G3 puede cerrar. Cinco bajos.
- **Evidencia del revisor:**
  - `vitest run tests/security tests/api` da 8 archivos y 52 pruebas en verde.
  - VC9-1 resistió 15 carreras nuevas: preparar mientras otro envía, el mismo reclamo ×4 con claves mezcladas, reclamos DRAFT duplicados heredados enviados en paralelo, reclamar tras REJECTED, el agente y el navegador a la vez, y 10 flujos en paralelo. También resistió la reproducción por HTTP real. En todos los casos hubo un solo REFUNDED y +USD 70.00.
  - VC9-2, VC9-3, VC9-6 y VC9-7 se sostienen. El tope por origen aguanta 6 turnos en paralelo desde 3 espacios del mismo origen.
  - `POST /api/evaluation/scripted-tasks` no se pudo usar como otro rol, sin sesión ni por CSRF. Corre una sola vez con su tope aunque lleguen 4 llamadas en paralelo y no filtra datos: 8 ids sin sesión y sin secretos.
  - Una corrida por HTTP: 8 de 8 en 38 s, USD 0.0039.
- **Costo del revisor:** una llamada al modelo real, USD 0.0039.

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC9-8 | bajo | VC9-4 se rodeaba con facilidad. 20 de 22 variantes no dejaban señal: chino tradicional, sinónimos, japonés, francés, alemán, "esqueça", base64 de texto con tildes o en trozos, hex, ancho cero y ancho completo. El efecto ya estaba bloqueado. | Corregido. El texto se normaliza con NFKC y sin caracteres de formato (`\p{Cf}`). Se decodifican como UTF-8 el base64 estándar y url-safe (también en trozos) y el hexadecimal. Se ampliaron las listas en fr, de, ja y zh tradicional, y se agregó "repeat everything above". Prueba nueva "VC9-4b" con 13 variantes de override y 5 de aprobación o secreto, y la lista negativa con preguntas normales en esos idiomas. Siguen sin cubrirse rot13, texto invertido, homoglifos y leet. Por eso las señales se declaran como rótulo de mejor esfuerzo en SECURITY_SELF_ASSESSMENT: el control está en el servidor. |
| VC9-9 | bajo | `scripted-tasks` y `session/logout` no validaban el cuerpo. Campos de autoridad en el cuerpo daban 200 y se ignoraban. | Corregido: `body: emptyBody` en las dos rutas. Prueba nueva: el cuerpo con `workspaceId`, `role`, `tasks` y `scenario` da 422 y no corre nada. |
| VC9-10 | bajo | El tope diario de corridas era global: un solo jurado agotaba el día para todos. | Corregido: se agregó un tope diario por origen (hash de la IP que pide la corrida, 10 por defecto, `SCRIPTED_TASKS_PER_ORIGIN_DAY`) además del global. Prueba nueva: un origen agota su cupo y otro sigue corriendo. |
| VC9-11 | bajo | No había límite de corridas simultáneas. Con 4 a la vez, la lectura del caso de otro usuario subió en local a picos de 18.5 s. | Corregido: empieza una sola corrida por minuto en todo el sistema. Ese límite se comprueba primero y no gasta cupos ajenos. Prueba nueva: dos evaluadores en paralelo dan una corrida y un 429. |
| VC9-12 | bajo | El error crudo de una tarea (por ejemplo el SQL o el host de la base) volvía al evaluador. | Corregido: se devuelve solo el código estable de `ApplicationError` o `DomainError`, o `UNEXPECTED_ERROR` para todo lo demás, y en el log queda solo el nombre del error. Prueba nueva con un error crudo de base de datos. |

Notas del revisor que no son hallazgos:
- Los reclamos DRAFT duplicados que dejó la primera ronda en `dev` siguen ahí y no se pueden enviar (422). Fue correcto no agregar un índice único sobre esos datos. En producción no existen.
- Los espacios que crea scripted-tasks no cuentan para el tope diario de espacios: son hasta 240 por día como máximo. Tampoco cuentan para el tope de IA por origen, pero su único turno (T8) cuesta unos USD 0.004 y está acotado por las corridas permitidas.
- Las variantes Unicode del delimitador (`＜case_state＞`) pasaban tal cual. Desde VC9-8 el texto del usuario se normaliza para las señales, pero no el que se envía al modelo; no son la etiqueta que describe el system prompt.

**Estado final de VC9:** sin críticos ni altos abiertos. Los 12 hallazgos de las dos rondas quedaron corregidos con su prueba, salvo VC9-5, que se resolvió como decisión (DEC-018) con una prueba que fija la regla.
