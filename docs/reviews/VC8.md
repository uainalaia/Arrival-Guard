# VC8 Agente (puerta G2): revisión independiente

- **Fecha:** domingo 18 de octubre, de 21:50 a 22:12 (Lima). **Revisor:** subagente `revisor`.
- **Rango:** `f0ea624..a3304a1`, la parte del agente (Fase 5). **Spec:** BUILD_PROMPT 13.1 a 13.6, 14.1, 14.2 (nivel agente), A5 y 4.3. **Criterios:** AUTONOMIA 6, VC8.
- **Método del revisor:** las pruebas del agente (19 de 19 en verde), sondas propias con un modelo guionizado contra Neon `dev` (en el scratchpad) y lectura del código. No volvió a correr `ai:turns` ni editó el repositorio. Sus sondas dejaron en `dev` filas de `ai_usage` con costo sintético por USD 0.26.
- **Veredicto:** aprobado con deuda. Sin críticos ni altos; tres medios y seis bajos. Según AUTONOMIA 6 no corresponde segunda ronda. Los tres medios y cinco bajos se corrigieron con pruebas; lo que queda está en la Deuda de PROGRESS.

## Criterios (según el revisor)

1. **Llamada real con la configuración 13.1 y herramientas strict:** cubierto. El adaptador coincide con 13.1 (max_tokens 2048, between_tools, effort low, cache_control en el system, `strict: true`, tool_choice auto) y el system prompt es idéntico a 13.4. Evidencia real: `docs/evidence/agent-turns-2026-10-19T02-20-43-194Z.json`.
2. **Sin herramientas de aprobación, límites, destinatarios, reloj ni fallas:** cubierto por `toolCatalog.ts`, `agentTools.test.ts` y la prueba de escalada con efectos en la base (política intacta, sin cambios pendientes, dos SECURITY_BLOCK de PRIVILEGE_ESCALATION). El actor sale de la sesión y Zod estricto rechaza `role`.
3. **Historial A5 y sin 400 en 20 turnos:** cubierto en el código y en la corrida real (20 turnos, 0 salidas seguras), con la brecha de VC8-2.
4. **Presupuesto y salida segura:** parcial por VC8-1 y por el costo de los timeouts.
5. **T1 por chat en producción:** el camino está listo; se demuestra al desplegar (ver PROGRESS, puerta G2).

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC8-1 | medio | El tope se leía y la reserva se insertaba en dos pasos: con 6 turnos en paralelo se gastó 2.2 veces el tope del espacio (y el tope diario tenía la misma carrera). | Corregido: la reserva es atómica, dentro de una transacción con `pg_advisory_xact_lock` (uno global para el día y otro por espacio, siempre en ese orden); se vuelve a sumar y solo se inserta si cabe en los dos topes. Prueba nueva: 6 turnos simultáneos con un modelo lento que informa uso real dejan 1 llamada, 5 BUDGET_EXHAUSTED y el gasto dentro del tope. |
| VC8-2 | medio | El texto del usuario de turnos pasados viajaba sin escapar: un `<case_state>` falso quedaba en el historial 8 turnos. | Corregido: el historial también pasa por `escapeUserText`. Prueba nueva: con el mensaje del revisor, ningún mensaje salvo el último contiene `<case_state>` ni `<user_message>`, y el último lleva uno solo. |
| VC8-3 | medio | Falsos positivos en preguntas normales ("Has my dad approved it yet?", una fecha, "Can I pay from this account?", "Is my password needed to pay?"). | Corregido: las preguntas no cuentan como aprobación afirmada; fechas y horas no cuentan como números de cuenta; "this account" sola ya no es un destino nuevo; un secreto cuenta solo si se pide. Las cinco frases y una hora están ahora en la lista negativa de `securitySignals.test.ts`; los ataques siguen detectados. |
| VC8-4 | bajo | Un timeout se registraba con costo 0, aunque pudo facturarse. | Corregido: el timeout conserva la estimación y cuenta para el tope; otro error libera la reserva. Prueba nueva. |
| VC8-5 | bajo | SECURITY_BLOCK, AI_FALLBACK_ACTIVATED y el turno se escribían antes del límite de turnos. | Corregido: el límite va primero y responde 429 (la interfaz pasa a modo estructurado). Prueba nueva: con un tope de 2 por minuto y AI_UNAVAILABLE, 5 mensajes dejan 2 turnos y 2 AI_FALLBACK_ACTIVATED. |
| VC8-6 | bajo | Mapeos dentro del caso de uso (turno a DTO, historial a mensajes, tool_result, costo) y la clave del agente derivada en la capa de interfaz. | Deuda (estructura, sin efecto en corrección). |
| VC8-7 | bajo | Pruebas débiles: el número de tarjeta se buscaba sin espacios; las listas de herramientas no eran exactas. | Corregido: búsqueda con separadores opcionales; listas exactas por rol con `toEqual`. |
| VC8-8 | bajo | `ai-turns` no comprobaba ni guardaba el estado de T1 según el servidor. | Corregido: guarda `t1` (estado visible, estado del intento y recibo leídos del servidor), falla si no es CREDITED y cuenta como falla cualquier salida segura. |
| VC8-9 | bajo | El plazo de 30 s podía rozar los 60 s de la ruta. | Corregido: no se empieza otra llamada pasados 25 s (25 + 25 s de la llamada + guardado < 60 s). |

## Observaciones del revisor

- Antes de G2 hay que confirmar que `ANTHROPIC_API_KEY` está en Production en Vercel (los humanos dijeron que la cargaron). Sin ella cada turno cae a salida segura; la demo en producción lo muestra en la primera respuesta.
- Faltan pruebas de nivel agente de S02, S11 y S12 con el modelo real, y de S04 y S05 sobre efectos: corresponden a VC9 y a `eval:agent`.

## Evidencia después de las correcciones

- `pnpm exec vitest run tests/integration/chatTurn.test.ts tests/unit/agentTools.test.ts`: 2 archivos, 19 pruebas en verde (incluye las 4 nuevas de VC8 y las 3 de herramientas P1).
- `pnpm exec vitest run tests/unit/domain/securitySignals.test.ts`: 5 pruebas en verde.
