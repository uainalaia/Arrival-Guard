# Bloqueos

Lo que falta para avanzar y solo pueden resolver los humanos. Lo más urgente va arriba. Cuando un bloqueo se resuelva, se marca como resuelto con la hora de Lima.

Última revisión: lunes 19 de octubre, 21:35 (Lima).

## Regla de orden de las fases (indicada por los humanos)

- Mientras faltaban los secretos, la regla era adelantar lo de la Fase 0 que no los necesita y la Fase 1 completa, y cerrar la Fase 0 antes de la Fase 2.
- **Los secretos están listos desde las 17:43.** Se sigue el orden normal: la Fase 0 se cierra completa (Neon `dev`, llamada real a Claude con la configuración 13.1 y despliegue en Vercel) antes de pasar a la Fase 1.

---

## Abiertos

- **B3. El objetivo de la sesión pide un estado que ya no es el elegido** (abierto el lunes 19 a las 21:35). El objetivo con el que se lanzó la construcción exige dos cosas:
  - que la entrega sea `v1.0.0-submission`;
  - ninguna capacidad nueva después del lunes 19 a las 12:00.

  Los humanos decidieron otra cosa en la conversación:
  - pidieron la pasada de movimiento de marca después de las 12:00 y eligieron "producción y tag nuevo" (DEC-022);
  - luego pidieron que producción tenga lo más actualizado (DEC-023).

  Cumplir el objetivo al pie de la letra exigiría mover `v1.0.0-submission`, que está prohibido, o deshacer lo que pidieron. **Solo los humanos pueden resolverlo:** ajustar o quitar esa condición del objetivo. La entrega es `v1.0.3-submission`, con producción, `main` y el tag en el mismo commit.

---

## Resueltos

- **B1. Faltaban tres secretos en `.env.local`** (resuelto 17:43). Los humanos completaron `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y `ANTHROPIC_API_KEY` con valores de la rama `dev` de Neon. Verificado con el script de verificación previa (exit 0, sin imprimir valores):
  - las 7 variables obligatorias están presentes;
  - `DATABASE_URL` tiene pooling y `DATABASE_URL_UNPOOLED` es la directa del mismo endpoint de Neon, ambas con `sslmode=require`;
  - `select 1` respondió con las dos cadenas (PostgreSQL 18);
  - la llamada mínima a `claude-sonnet-5-5` con `between_tools`, effort `low`, `tool_choice: auto` y una herramienta `strict` respondió `end_turn`.
- **B2. Faltaban las variables de entorno en Vercel** (resuelto 17:43). Los humanos las cargaron. Production usa la rama `production` de Neon (la que los documentos llaman `main`, ver DEC-001) y Preview usa `dev`. Verificado con `vercel env ls` (solo nombres):
  - Production: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `SESSION_PEPPER`, `EVAL_ACCESS_CODE` y `APP_BASE_URL`.
  - Preview: las mismas salvo `APP_BASE_URL`. No hace falta, porque en un preview se deriva de las variables de sistema de Vercel (DEC-002).
- **R1. pnpm no estaba instalado** (resuelto 16:37). Lo instalé con `npm install -g pnpm@12.14.0` en el prefijo de usuario (`%APPDATA%\npm`, sin permisos de administrador). `pnpm --version` responde 12.14.0 en Git Bash y en PowerShell. npm avisó que no corrió los scripts de instalación del paquete (`allow-scripts`); pnpm funciona igual. Si fallara, la alternativa es `corepack`.
- **R2. Repositorio git local** (resuelto 16:38). `git init -b main`, commit `a3466e2` con las especificaciones y rama `dev`.
- **R3. Repositorio remoto** (resuelto 17:12, autorizado por los humanos). `gh repo create arrivalguard --private --source . --remote origin --push` desde `main`, y después `git push -u origin dev`. Verificado: `origin` apunta a `https://github.com/iamjosels/arrivalguard.git`, el remoto tiene `main` y `dev`, visibilidad `PRIVATE` y rama por defecto `main`.
- **R4. Proyecto de Vercel** (resuelto 17:14, autorizado por los humanos). `vercel project create arrivalguard`, preset Next.js y Node 24.x, `vercel link --yes --project arrivalguard` y `vercel git connect`. Verificado por la API: conectado a `iamjosels/arrivalguard`, rama de producción `main` y dominio de producción `arrivalguard.vercel.app`. Los efectos secundarios de `vercel link` en `.env.local` y `.gitignore` se revirtieron (DEC-004).
- **R5. `.env.local` creado** (resuelto 17:15). UTF-8, sin BOM, ignorado por git. `SESSION_PEPPER` y `EVAL_ACCESS_CODE` se generaron al azar con `crypto` y no se mostraron.
- **R6. Modo automático** (resuelto 17:16). Agregué el bloque `autoMode` de ARRANQUE a `C:\Users\giosi\.claude\settings.json` sin borrar nada. No había `defaultMode`, así que no hubo nada que quitar. `claude auto-mode config` ya muestra las dos reglas de ArrivalGuard.
