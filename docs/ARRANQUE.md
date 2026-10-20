# Arranque del modo autónomo

Dos mensajes. El primero lo mandas y te quedas mirando unos 10 minutos. El segundo lo mandas cuando Claude Code responda "LISTO PARA /goal", y después lo dejas trabajar.

## Preparación (una sola vez, antes de abrir Claude Code)

1. **Neon:** proyecto con ramas `main` (producción) y `dev`. De cada una, la cadena con pooling y la directa.
2. **`.env.local`** en la raíz, solo con valores de `dev`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-sonnet-5-5`, `SESSION_PEPPER`, `EVAL_ACCESS_CODE`, `APP_BASE_URL=http://localhost:3000`. Pepper: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. No pongan la clave de Anthropic como variable de entorno de Windows.
3. **Repositorio** (PowerShell en la carpeta, antes de abrir Claude Code, porque el modo automático solo confía en los remotos que existían al empezar):
   ```powershell
   git init -b main
   git add .gitignore .gitattributes .claude docs
   git commit -m "docs: especificaciones y diseño"
   gh repo create arrivalguard --private --source . --remote origin --push
   git switch -c dev
   git push -u origin dev
   ```
4. **Vercel:** importar el repo (framework Next.js, rama de producción `main`). Variables en Production con las cadenas de Neon `main` y en Preview con las de `dev`; en ambas `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `SESSION_PEPPER`, `EVAL_ACCESS_CODE` (el mismo de `.env.local`) y `APP_BASE_URL` (la URL de producción). El primer build falla porque aún no hay código: es normal. Recomendado: `npm i -g vercel`, `vercel login`, `vercel link`.
5. **Claude Code:** `claude update`, abrir en la carpeta y confirmar `⏵⏵ auto mode on` en la barra de estado (si no aparece: `claude --permission-mode auto`; en la app de escritorio, selector de modo en Auto). Agregar el bloque `autoMode` de abajo a `C:\Users\<usuario>\.claude\settings.json` y comprobarlo con `claude auto-mode config`. No usar `--dangerously-skip-permissions`.
6. **PC despierta:** suspensión en "Nunca", Windows Update en pausa por una semana, cargador conectado y la ventana abierta. Si se acaba el límite de uso, Claude Code espera y continúa solo; si la PC durmió más de 30 minutos, hay que presionar Enter.

```json
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Organization: two-student team building ArrivalGuard, a FinTechathon 2026 hackathon demo that uses only synthetic data. Primary use: software development",
      "CI/CD deploy targets: the Vercel project linked to the ArrivalGuard repository; pushes to main deploy production and pushes to other branches create previews",
      "Key internal services: the ArrivalGuard Neon Postgres project (branches dev and main) and the Anthropic API"
    ],
    "allow": [
      "$defaults",
      "Pushing to the dev and main branches of the ArrivalGuard repository's origin remote is allowed even though main triggers a Vercel production deploy: it is a hackathon demo with synthetic data only",
      "Running the ArrivalGuard project's own scripts (pnpm db:migrate, db:seed-check, eval:*, tasks:run, smoke) against its Neon dev branch or against the demo's production URL is allowed: synthetic data only"
    ]
  }
}
```

## Mensaje 1: verificación previa

```text
Vamos a construir ArrivalGuard completo en modo autónomo. En este primer turno haz solo la preparación y la verificación previa; el trabajo largo empieza cuando te mande /goal.

1. Lee completos docs/AUTONOMIA.md (manda sobre el proceso), docs/BUILD_PROMPT.md y docs/UI_UX_PROMPT.md. Con subagentes: (a) lee las páginas del PDF de docs/plan/ que indica la sección 3 del BUILD_PROMPT y deja un resumen fiel en docs/plan/NOTAS_PDF.md; (b) revisa los exportes de Claude Design en docs/design/ y deja docs/design/DESIGN_PLAN.md con pantallas, componentes, textos y tokens.
2. Verificación previa, sin mostrar ningún valor secreto (solo "presente" o "ausente"): Node 24, pnpm y git; gh auth status; remoto origin y rama actual; las variables de .env.local que pide la sección 17 (cárgalas con un script, no abras el archivo); select 1 contra la rama dev de Neon; una llamada mínima a la API de Anthropic con ANTHROPIC_MODEL; vercel whoami si la CLI está instalada.
3. Crea docs/BLOQUEOS.md con lo que falte y qué debemos hacer nosotros. Asegúrate de estar en la rama dev.
4. Termina con tres listas cortas (OK, bloqueos, riesgos) y la frase "LISTO PARA /goal" si nada impide la Fase 0.

Autorizaciones permanentes para toda esta sesión, exactamente con este alcance:
- Hacer push a las ramas dev y main de origin. Un push a main despliega producción en el proyecto de Vercel enlazado a este repositorio, y su comando de build aplica las migraciones Drizzle (solo aditivas) a la rama main de Neon. Autorizado al cerrar cada fase con pnpm verify en verde.
- Ejecutar las migraciones y los scripts del proyecto (db:migrate, db:seed-check, eval:*, tasks:run, smoke) contra la rama dev de Neon y contra la URL de producción de la demo. Todos los datos son sintéticos.
- Crear el tag v1.0.0-submission (y v1.0.1-submission si hiciera falta una corrección crítica) y enviarlo a origin.
No autorizado: force push, borrar ramas o tags remotos, cambiar la visibilidad del repositorio, tocar las variables de entorno de Vercel, usar credenciales de producción en local, enviar correos o formularios, publicar algo fuera del repositorio.
```

## Mensaje 2: el objetivo (una sola línea)

```text
/goal ArrivalGuard queda construido, desplegado y congelado según docs/BUILD_PROMPT.md, docs/UI_UX_PROMPT.md y docs/AUTONOMIA.md (este último manda sobre el proceso: trabajar de corrido de la Fase 0 a la 9 sin pedir permiso entre fases y con las verificaciones críticas VC1 a VC11). Solo cuenta como cumplido si Claude lo demuestra en esta conversación con evidencia real, es decir, el comando ejecutado y su salida, nunca con afirmaciones: (1) docs/PROGRESS.md marca cerradas las Fases 0 a 9 y las puertas G1 a G5, cada cierre con pnpm verify terminando en exit 0 y cada verificación crítica con su revisión independiente en docs/reviews/ sin hallazgos críticos ni altos abiertos; (2) todos los P0 están terminados (T1, T2, T5, T6 y T8; S01 a S12 en verde en el servidor; acceso del jurado con código de evaluación según A4; producción desplegada; README, TECHNICAL y SECURITY_SELF_ASSESSMENT) y cada P1 está terminado o figura en PROGRESS.md como recortado con su motivo; (3) pnpm smoke contra la URL de producción termina en CREDITED, y tasks:run y results:report se corrieron contra producción, con los documentos de resultados citando esa corrida (commit y fecha); (4) secrets-scan en verde, árbol de git limpio y el tag v1.0.0-submission creado y enviado a origin; (5) docs/INFORME_FINAL.md y docs/PARA_HUMANOS.md escritos y el informe final mostrado en la conversación. También se da por cumplido si ya pasó el lunes 19 de octubre a las 16:00 de Lima (comprobado con un comando) y Claude creó el tag con todo lo que estaba en verde, declaró lo pendiente en el informe final y mostró ese informe. Restricciones durante todo el trabajo: no debilitar, saltar ni borrar pruebas; no inventar resultados; no imprimir secretos; no force push ni reescritura de historia; ninguna capacidad nueva después del lunes 19 a las 12:00 de Lima. Un bloqueo que solo pueden resolver los humanos se anota en docs/BLOQUEOS.md y el trabajo sigue con todo lo demás; un bloqueo anotado no cuenta como cumplido.
```

## Mientras trabaja

- `/goal` sin texto muestra el estado: tiempo, turnos, gasto y lo último que evaluó.
- Lo que tienen que hacer ustedes aparece en `docs/PARA_HUMANOS.md`; lo que falta, en `docs/BLOQUEOS.md`; el estado, arriba de `docs/PROGRESS.md`.
- Pueden escribirle en cualquier momento: atiende el mensaje y retoma.
- `Esc` frena el turno en curso; `/goal clear` quita el objetivo.
- Si se cierra la terminal o la app, abre Claude Code en la misma carpeta con `claude --continue`: recupera la sesión y el objetivo.
