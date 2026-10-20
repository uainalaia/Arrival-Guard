# VC5 Migraciones: revisión independiente

- **Fecha:** domingo 18 de octubre, de 19:06 a 19:21 (Lima). **Revisor:** subagente `revisor`, en la misma ronda que VC4.
- **Rango:** `ae1fc7b..605365f` (Fase 2). **Criterios:** AUTONOMIA 6, VC5 (mostrar el SQL; base vacía y existente sin pérdida de datos), y migraciones solo aditivas según el permiso del primer mensaje. AUTONOMIA no exige revisor para VC5; esta revisión se hizo igual.
- **Veredicto:** aprobado, con una observación baja.

## Lo que demostró el revisor

`tests/integration/migrations.test.ts`:
- El SQL generado no tiene `DROP`, `RENAME` ni cambios de tipo de columna.
- Se aplica completo sobre un esquema temporal vacío de la rama `dev` (29 tablas y los índices parciales).
- Se vuelve a aplicar sobre la base existente.

## Observación baja y qué se hizo

| ID | Severidad | Observación | Acción |
|---|---|---|---|
| VC5-1 | bajo | Con una sola migración la reaplicación era un no-op, y solo comparaba `workspaces` y `domain_events` con ">=". Para la próxima migración convenía comparar todas las tablas sobre un esquema sembrado en la versión anterior. | Hecho con la migración `0001`: prueba nueva que aplica todas las migraciones menos la última sobre un esquema temporal, siembra un espacio y tres filas del libro (dos históricas sin transferencia y una con transferencia), aplica la última y exige los mismos conteos en las 29 tablas y la columna nueva. La reaplicación sobre la base existente ahora compara las 29 tablas. |

## Migración nueva de la Fase 2 (`drizzle/0001_dear_puck.sql`)

```sql
ALTER TABLE "payment_attempts" ADD COLUMN "submit_lease_until" timestamp with time zone;
CREATE UNIQUE INDEX "sim_institution_ledger_transfer_uq" ON "sim_institution_ledger" USING btree ("workspace_id","transfer_id") WHERE "sim_institution_ledger"."transfer_id" is not null;
```

Las dos son aditivas: una columna que admite nulos y un índice parcial. Se aplicó en `dev` con `pnpm db:migrate` ("OK, 2 migraciones registradas"). En `production` la aplica el build de Vercel al llevar la Fase 2 a `main`.

## Evidencia

- `pnpm exec vitest run tests/integration/migrations.test.ts tests/integration/vc4Review.test.ts`: 2 archivos, 7 pruebas en verde (92 s).
