# VC7 Interfaz: revisión independiente

- **Fecha:** domingo 18 de octubre, de 20:59 a 21:19 (Lima). **Revisor:** subagente `revisor`, con las capturas de `docs/design/screens/`.
- **Rango:** `0eee748..f0ea624` (Fase 4). **Spec:** UI_UX_PROMPT completo, DESIGN_PLAN 5.1 a 5.9 y los exportes de `docs/design/`; BUILD_PROMPT 4, 11 y 15.2 para dominio y API. **Criterios:** AUTONOMIA 6, VC7.
- **Método del revisor:** lectura de las 34 capturas y de los exportes; reproducciones por HTTP contra `pnpm dev --port 3300` (apagado al terminar); pruebas unitarias de la interfaz. No editó el repositorio.
- **Veredicto de la ronda 1:** rechazado por un hallazgo alto, sin críticos. Según AUTONOMIA 6 no corresponde segunda ronda. El alto y los medios se corrigieron con pruebas; los bajos, casi todos; lo que queda está en la Deuda de PROGRESS.

## Criterios cubiertos (según el revisor)

- T1 solo con clics con `scripts/ui-check.ts` (Playwright), hasta CREDITED.
- Banda de simulación en la landing, el espacio, la consola, /system, el documento, la confirmación y los estados de error.
- Sin punto flotante sobre montos en `src/ui`; ningún cuerpo lleva rol, actor ni espacio; el reintento tras un error de red usa la misma clave; el documento muestra solo campos del ApprovalViewDTO; el aviso de la universidad se muestra como dato; "Credited" y los estados salen del servidor; un primario por zona; foco visible; movimiento reducido.

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC7-1 | alto | Tras una falla confirmada y una solicitud nueva, el documento mostraba "Approved" con la aprobación consumida y escondía "Approve this payment": la demo quedaba trabada. | Corregido en el servidor y en la interfaz: `GetApprovalViewUseCase` devuelve la aprobación vigente, y la consumida solo si el plan ya salió o terminó; el documento cuenta como aprobado solo eso. Prueba de integración nueva en `t1Flow.test.ts`: falla confirmada, nueva solicitud, la vista no trae aprobación, Carlos aprueba de nuevo y el pago sale una vez. |
| VC7-2 | medio | La clave de idempotencia de la interfaz dependía solo del plan y su versión: tras una falla confirmada, el reintento devolvía el intento fallido como repetición. | Corregido: la clave queda ligada también a la aprobación vigente. |
| VC7-3 | medio | Avisos que contradecían al servidor: "Plan ready" con un plan NOT_VIABLE, "Payment sent" con FAILED_CONFIRMED y "Still waiting" con el ícono de éxito. | Corregido: los avisos se eligen por `plan.status` y `attempt.status` de la respuesta; los de espera y falla usan el aviso neutro. `ui:check` ahora espera el aviso real de "Check this payment". |
| VC7-4 | medio | Sin ruta elegida, el tablero siempre decía "No route arrives in time", aunque la razón fuera el límite. | Corregido: el titular sale de los bloqueos del plan o de la razón común a todas las rutas. Prueba unitaria `routeBoardHeadline.test.ts`. |
| VC7-5 | medio | "Plan my payment" seguía activo con la matrícula acreditada y el servidor creaba un plan NOT_VIABLE que reemplazaba al que la pagó. | Corregido: el servidor rechaza con `OBLIGATION_NOT_PENDING` sin crear nada (DEC-016) y la interfaz deshabilita el formulario. Prueba de integración. |
| VC7-6 | medio | La proyección de caja no se refrescaba, calculaba el veredicto en el cliente y daba veredicto a monedas que el servidor no evalúa. | Corregido: se vuelve a pedir cuando cambian el saldo, las retenciones o el plan; usa el veredicto del servidor y lo muestra solo en su moneda. |
| VC7-7 | medio | El documento no avisaba si el plan cambiaba mientras estaba abierto (solo tras un 409). | Corregido: recuerda la versión y la huella vistas al abrir; si el refresco (cada 5 s) trae otras, muestra la banda "This plan changed. Review the new version." y deshabilita la aprobación hasta revisar. |
| VC7-8 | medio | Las capturas del documento eran solo la parte visible: el documento sellado en móvil nunca se capturó. | Corregido: el documento se captura completo (`fullPage`). Que entre en 900 px de alto queda en la Deuda. |
| VC7-9 | medio | Faltaban "AI usage" y "Scripted tasks" en la consola y la conciliación cada 10 s; la landing prometía transferencias y devoluciones que todavía no existen. | "AI usage" agregado con datos reales de `ai_usage` (espacio y día contra sus topes). Conciliación automática cada 10 s con un pago en vuelo. Los escenarios, capacidades y textos de transferencias y devoluciones quedan ocultos hasta la Fase 6 (`P1_AVAILABLE`). "Run T1 to T8" llega con `tasks:run` en la Fase 8 (Deuda). |
| VC7-10 | bajo | Horas sin día en la línea del pago. | Corregido con `formatWhen` (el día aparece si no es el del inicio). |
| VC7-11 | bajo | La banda de simulación no quedaba fija en el documento ni en la confirmación. | Corregido (fija arriba). |
| VC7-12 | bajo | Objetivos táctiles de menos de 44 px y la huella del estado pendiente oculta a lectores de pantalla. | Corregido: 44 px en móvil para enlaces y botones señalados; el texto de la huella se lee en el estado pendiente. |
| VC7-13 | bajo | Pruebas débiles en `ui:check`: axe no fallaba la corrida, "Check this payment" casi no se pulsaba, no se verificaba la ruta B y había navegación con `goto`. | Corregido: axe y el scroll horizontal hacen fallar; se verifica la ruta B; "Check this payment" se pulsa y se espera su aviso; las vueltas son con clics. |
| VC7-14 | bajo | La actividad del pagador mostraba el monto de la factura en vez del neto del recibo. | Corregido. |
| VC7-15 | bajo | Diferencias menores con UI_UX y DESIGN_PLAN: indicador de cambios en las pestañas móviles, columna de estado del tablero de la landing en móvil, enlaces a la guía y al video, nombres de escenario leídos de la configuración. | En la Deuda de PROGRESS (los enlaces a la guía y al video dependen de documentos de la Fase 8 y del video de los humanos). |

## Evidencia después de las correcciones

- `pnpm ui:check --base-url http://localhost:3000` contra `pnpm build && pnpm start`: T1 solo con clics hasta CREDITED, con "Check this payment" pulsado mientras espera la universidad; `axe: 34 capturas revisadas, 0 violaciones serias o críticas`; `scroll horizontal: ninguno`.
- El cierre de la Fase 4 en `PROGRESS.md` incluye el `pnpm verify` completo.
