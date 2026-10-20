# VC2 Motor de políticas: revisión independiente

- **Fecha:** domingo 18 de octubre, 18:35 (Lima). **Revisor:** subagente `revisor`.
- **Rango:** `cf4e5a1..e033135` (Fase 1). **Spec:** BUILD_PROMPT 6 y 8.3. **Criterios:** AUTONOMIA 6, VC2.
- **Veredicto:** aprobado con observaciones.

## Criterios cubiertos (según el revisor)

- A por `DEADLINE_MISSED`, C por `NET_INSUFFICIENT` con CNY 19,800.00, E por `RECEIVER_NOT_ALLOWED`; con 48 h gana B (débito 2,860.00, saldo 2,140.00); con 6 h gana D (2,880.00, saldo 2,120.00); con 1 h no hay ruta: `tests/unit/domain/policyEngine.test.ts`, con cifras literales. `scenarios.test.ts` compara la configuración con la sección 6.
- Tope acumulado por obligación (1,500 + 1,500): `policyEngine.test.ts` y `executionGuard.test.ts`; falla si se ignora lo comprometido.
- Orden de selección y determinismo: el desempate y la entrada invertida fallan si se invierte el orden.

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC2-1 | bajo | La regla "el débito toca dinero apartado" no tenía una prueba que la separara de la reserva mínima. | Prueba nueva: apartado 1,800, reserva mínima 1,000 y saldo 4,500 dan `BREAKS_RESERVE`. |
| VC2-2 | bajo | Faltaban pruebas de borde: llegada justo en el objetivo y cotización justo en su vencimiento. | Prueba nueva que fija el criterio: llegar justo en el objetivo es a tiempo; en el minuto 15 la cotización ya venció y en el 14 no. |
