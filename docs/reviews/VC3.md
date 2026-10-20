# VC3 Consentimiento: revisión independiente

- **Fecha:** domingo 18 de octubre, 18:35 (Lima). **Revisor:** subagente `revisor`.
- **Rango:** `cf4e5a1..e033135` (Fase 1). **Spec:** BUILD_PROMPT 3 (A3) y 8.4. **Criterios:** AUTONOMIA 6, VC3.
- **Veredicto de la ronda 1:** requiere correcciones (un hallazgo alto y cuatro medios). No hubo críticos, así que según AUTONOMIA 6 no corresponde una segunda ronda. Los hallazgos altos y medios se corrigieron con pruebas; los bajos también.

## Criterios cubiertos (según el revisor)

- Huella con los 16 campos, estable y distinta ante cada cambio: `tests/unit/domain/consent.test.ts`.
- Validez por planId, planVersion, huella y vencimiento (`usableFor`).
- A3: 2,865.00 pasa y 2,905.00 da `EXCEEDS_PAYER_MAX`; solo la misma ruta, canal, receptor y neto.

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC3-1 | alto | `Approval.grant` recibía sujeto, versión, espacio, vencimiento, máximo y reserva aparte del payload hasheado, sin comprobar que coincidieran. | Corregido: `grant` recibe el payload firmado tipado (`signed`) y saca de él todos esos datos. `signedTuitionPayload(hasher)` verifica la integridad y la coherencia del payload guardado. Pruebas nuevas en `consent.test.ts`. |
| VC3-2 | medio | El guard leía el alcance A3 de un payload que nadie verificaba contra la aprobación, y el contrato de `expectedFingerprint` era ambiguo. | Corregido: el guard lee el alcance de la propia aprobación (payload íntegro según su huella) y compara plan, versión, obligación y su versión, cuenta, referencia y espacio. Se eliminó `expectedFingerprint`. Pruebas nuevas: un payload alterado da `APPROVAL_INVALID`; la recotización a 2,865.00 da `[]` y a 2,905.00 da `EXCEEDS_PAYER_MAX`. |
| VC3-3 | medio | `checkRequoteWithinApproval` permitía recotizar con la aprobación vencida o con la cotización nueva vencida. | Corregido: exige una aprobación vigente (si no, `APPROVAL_EXPIRED` o `APPROVAL_REVOKED`) y una cotización nueva vigente (`QUOTE_EXPIRED`). Pruebas nuevas. |
| VC3-4 | medio | Nada probaba la mitad "máximo aprobado" de min(aprobado, vigente) ni las dos mitades de max(reservas). | Pruebas nuevas en `consent.test.ts` y `executionGuard.test.ts`: con el máximo vigente subido a 3,500.00 y un débito de 2,950.00 da `EXCEEDS_PAYER_MAX`; una reserva aprobada o vigente de 2,200.00 da `BREAKS_RESERVE`. |
| VC3-5 | medio | `retarget` cambiaba el objetivo en cualquier estado y sin validar el vencimiento; no había prueba de "cambio de objetivo que obliga a otra ruta". | Corregido: `retarget` exige un estado previo a la ejecución y un objetivo no posterior al vencimiento. Prueba nueva: el plan B aprobado con el objetivo cambiado a 6 h da `DEADLINE_MISSED`. |
| VC3-6 | bajo | La prueba de SHA-256 comparaba el hasher consigo mismo. | Prueba nueva con el vector conocido de "abc" y una huella dorada del payload base. |
| VC3-7 | bajo | La prueba "cambiar solo el objetivo no es material" comparaba dos payloads idénticos, y `reference` no tenía prueba. | Reescrita: los campos no materiales no cuentan; pruebas nuevas para `reference` y para el neto en otra moneda. |
| VC3-8 | bajo | El guard no comparaba los ids de la obligación ni el espacio, y sus razones propias se podían quitar sin que fallara nada. | Corregido: compara obligación, cuenta y espacio. Pruebas nuevas por razón: `CHANNEL_NOT_ALLOWED`, `RECEIVER_NOT_ALLOWED` y `NET_INSUFFICIENT`. |

## Notas del revisor para las fases siguientes

- Probar en la Fase 2 que un bloqueo por recotización devuelve el plan a `READY_FOR_APPROVAL` e invalida la aprobación.
- VC4: `newAttemptBlockers` debe recibir los intentos de la obligación, no solo los de la versión del plan. El ejecutor de la Fase 2 usa `attempts.listForObligation`; se prueba en VC4.

## Incidente durante la revisión

El revisor mutó una copia del repositorio cuyo `node_modules` estaba enlazado al del repo real. Un `pnpm exec` corrido en la copia reescribió enlaces del repo real entre las 18:24 y las 18:28, aproximadamente. El revisor lo reparó con `pnpm install --frozen-lockfile --offline`. Comprobado a las 18:40: lockfile sin cambios, 0 enlaces rotos y la suite unitaria en verde. En las próximas revisiones se le pide no correr comandos de pnpm en copias del repositorio.
