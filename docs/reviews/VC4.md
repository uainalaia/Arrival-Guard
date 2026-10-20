# VC4 Ejecutor y conciliación: revisión independiente

- **Fecha:** domingo 18 de octubre, de 19:06 a 19:21 (Lima). **Revisor:** subagente `revisor`.
- **Rango:** `ae1fc7b..605365f` (Fase 2). **Spec:** BUILD_PROMPT 8.5, 8.6, 10, 11 y 12, escenarios N01 y O01 a O08. **Criterios:** AUTONOMIA 6, VC4.
- **Método del revisor:** unitarias 382/382 e integración 21/21 contra Neon `dev`; mutaciones y pruebas propias en una copia sacada con `git archive HEAD` en el scratchpad. No editó el repositorio ni abrió `.env.local`.
- **Veredicto de la ronda 1:** requiere correcciones (dos hallazgos altos, tres medios y dos bajos). No hubo críticos, así que según AUTONOMIA 6 no corresponde una segunda ronda. Todos los hallazgos se corrigieron con pruebas.

## Criterios cubiertos (según el revisor)

- Intento persistido antes de enviar: el espía de `persistBeforeSend.test.ts` ve SUBMITTING, la retención ACTIVE y la aprobación CONSUMED en el momento del envío.
- Misma clave y mismo contenido devuelve lo existente; misma clave con otro contenido da 409 (`IdempotencyConflictError`).
- Concurrencia real (O04): `Promise.allSettled` con claves distintas deja 1 intento, saldo 2,140.00 y 1 DEBIT_CONFIRMED.
- UNKNOWN nunca habilita otro pago (O03 con otra clave da `ActiveAttemptExistsError`).
- Falla confirmada libera una sola vez (O07 y la unitaria de la cuenta).
- N01, O01, O02a, O02b, O05, O07 y O08 con los números de la sección 6. O06 queda para la Fase 5 (no hay adaptador de IA en este rango).
- Orden de bloqueo, ninguna llamada externa dentro de nuestras transacciones, rol y espacio solo desde el ActorContext, filtro por espacio, dinero en bigint, sin `.skip`, `.only` ni secretos.

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC4-1 | alto | El simulador del proveedor, ante la misma clave y el mismo contenido, devolvía lo existente pero volvía a entregar a la universidad: dos filas en `sim_institution_ledger` (CNY 40,000.00 acreditados, exceso verificado de CNY 20,000.00, que T7 podría reclamar). | Corregido: `submitTransfer` inserta la transferencia en PROCESSING con `on conflict do nothing`; si ya existía, compara el hash y devuelve lo existente sin efectos. Solo la primera inserción consume fallas, emite eventos y entrega a la universidad. `receiveTransfer` también es idempotente y la migración `0001` agrega el índice único parcial `(workspace_id, transfer_id)` en el libro. Prueba nueva `vc4Review.test.ts` (VC4-1): un segundo `submitTransfer` deja 1 transferencia, 1 fila de libro, 20,000.00 acreditados y exceso 0. |
| VC4-2 | alto | Conciliar un intento SUBMITTING lo reenviaba mientras el envío original seguía en curso; el segundo envío chocaba (23505), `submit` lo trataba como respuesta perdida (UNKNOWN, PROVIDER_RESPONSE_LOST falso) y la ejecución original fallaba con el dinero ya enviado. | Corregido: permiso de envío de 30 s por intento (`submit_lease_until`, tomado con un UPDATE condicional); la conciliación no reenvía si otro envío está en curso; solo `ProviderTimeoutError` lleva a UNKNOWN; otro error deja el intento como estaba, suelta el permiso y responde `PROVIDER_UNAVAILABLE`. Se quitó el camino que daba FAILED_CONFIRMED "NOT_RECEIVED" con un envío que podía seguir en vuelo. Prueba nueva (VC4-2): ejecución y conciliación en paralelo con demoras de 0, 150 y 400 ms; en los tres casos la ejecución se cumple, el intento queda PENDING_UNIVERSITY, sin PROVIDER_RESPONSE_LOST ni ATTEMPT_UNKNOWN, con 1 transferencia, 1 fila de libro y saldo 2,140.00. |
| VC4-3 | medio | Drizzle 0.45 envuelve el error del driver (`DrizzleQueryError`, código en `cause.code`), así que la red de seguridad del índice único nunca se activaba y un choque saldría como 500 con el SQL. | Corregido: `isUniqueViolation` recorre `cause`; los repositorios traducen 23505 a `DuplicateRecordError` y el ejecutor captura ese tipo. Prueba nueva (VC4-3): el error envuelto se reconoce; insertar un segundo intento activo da `DuplicateRecordError`; con una unidad de trabajo que lanza ese error, la misma clave devuelve replay y otra clave da `ActiveAttemptExistsError` con el id existente. |
| VC4-4 | medio | La máscara de números largos alteraba UUID y huellas (114 de 937 eventos en `dev`), así que la bitácora dejaba de correlacionar. | Corregido: la máscara solo toca números aislados; los campos de identificadores, huellas, claves de idempotencia y unidades menores se conservan (salvo que contengan un secreto). Pruebas nuevas en `tests/unit/redact.test.ts` y, en N01, todo `payload.attemptId` es igual a su `subject_id`. |
| VC4-5 | medio | O03, O04 y O05 no miraban el lado del proveedor: una mutación que creaba una segunda transferencia seguía en verde. O04 no comprobaba el id del intento existente. | Corregido en `t1Flow.test.ts`: O03 exige 1 transferencia con la clave del intento, su id igual a `providerTransferId` y 1 fila de libro; O04 y O05 exigen 1 transferencia y 1 fila de libro; O04 exige que el 409 traiga el id del ganador. |
| VC4-6 | bajo | Ninguna prueba de integración ejecutaba una obligación ya acreditada con una clave nueva. | Prueba nueva en N01: con una clave nueva da `OBLIGATION_NOT_PENDING` y sigue habiendo 1 intento. Ver también DEC-015 (el bloqueo lo decide el estado de la obligación). |
| VC4-7 | bajo | PROVIDER_SUBMIT_SENT se registraba en la transacción de creación, antes del envío. | Corregido: se registra cuando el proveedor responde (ACCEPTED o FAILED) o cuando no responde (NO_RESPONSE). Prueba nueva en `persistBeforeSend.test.ts`: un proveedor que falla antes de recibir no deja PROVIDER_SUBMIT_SENT ni transferencia; después, la conciliación envía el mismo intento con su clave, sin esperar el vencimiento del permiso, y queda 1 PROVIDER_SUBMIT_SENT, 1 transferencia y 1 fila de libro. |

## Datos de `dev`

Antes de aplicar la migración `0001` se borraron en la rama `dev` de Neon las 6 filas duplicadas del libro que habían dejado las corridas anteriores (se conservó la más antigua de cada grupo). La rama `production` nunca ejecutó el simulador del proveedor (las rutas de pago no estaban desplegadas), así que el índice nuevo no encuentra duplicados allí.

## Evidencia después de las correcciones

- `pnpm exec vitest run --project integration`: 9 archivos, 42 pruebas en verde (237 s, Neon `dev`).
- `pnpm exec vitest run tests/integration/persistBeforeSend.test.ts tests/integration/vc4Review.test.ts tests/api tests/security`: 6 archivos, 23 pruebas en verde.
- El cierre de la Fase 2 en `PROGRESS.md` incluye el `pnpm verify` completo.
