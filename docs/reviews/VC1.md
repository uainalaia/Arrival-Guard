# VC1 Dinero: revisión independiente

- **Fecha:** domingo 18 de octubre, 18:35 (Lima). **Revisor:** subagente `revisor`.
- **Rango:** `cf4e5a1..e033135` (Fase 1). **Spec:** BUILD_PROMPT 4.2, 4.4 y 8.1. **Criterios:** AUTONOMIA 6, VC1.
- **Método del revisor:** lectura del diff completo, `vitest run tests/unit` (358 en verde), `pnpm db:seed-check` y 36 mutaciones sobre una copia del repositorio.
- **Veredicto:** aprobado con observaciones.

## Criterios cubiertos (según el revisor)

- Money con `bigint`, inmutable y sin mezclar monedas: `tests/unit/domain/money.test.ts`. Quitar el chequeo de moneda del FX rompe la suite.
- DTO `{ currency, minor: string }` y `MoneyMapper`: `tests/unit/moneyFormat.test.ts`. No hay montos como `number` en `src`.
- Formato `USD 2,860.00` y `CNY 20,000.00` solo con BigInt: `tests/unit/moneyFormat.test.ts`.
- Prueba de arquitectura: `tests/unit/architecture.test.ts` falla con `Number(` en Money.ts o con un import de `drizzle-orm` en el dominio.

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC1-1 | bajo | La liquidación de la devolución en USD 70.00 frente a un exceso en CNY 500.00 no tiene cotización explícita. | Documentado en DEC-013: es un monto informado por la institución, no una conversión; la interfaz nunca lo presenta como conversión. |
| VC1-2 | bajo | `convertWithQuote` confiaba en el tipo para `synthetic`, `id`, monedas distintas, tasa y fecha. | Corregido: validación en tiempo de ejecución en `src/domain/money/Rate.ts` y prueba nueva en `money.test.ts`. |
