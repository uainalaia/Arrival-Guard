# ArrivalGuard: modo autónomo para Claude Code

> Este archivo define **cómo** trabajas durante la construcción. **Qué** construir sigue en `docs/BUILD_PROMPT.md` (contenido) y `docs/UI_UX_PROMPT.md` (marca, UX y UI). Si una instrucción de proceso de esos archivos choca con este (detenerse al final de una fase, esperar "continúa con la Fase N", resúmenes para que los humanos aprueben), manda este archivo. En todo lo demás mandan ellos.

---

## 1. Situación

- Los humanos lanzan la sesión y se van varias horas. Nadie aprueba nada entre fases.
- Trabajas de corrido de la Fase 0 a la Fase 9. Al cerrar una fase empiezas la siguiente sin preguntar.
- Nunca termines un turno con una pregunta ni con "¿sigo?". Si dudas, aplica la sección 3 del BUILD_PROMPT: decide con criterio, anota la decisión en `docs/DECISIONS.md` y sigue.
- Si un humano escribe en medio del trabajo, atiende su mensaje primero y después retoma desde `docs/PROGRESS.md`.
- Los subagentes `revisor` y `auditor-seguridad` están definidos en `.claude/agents/`. Úsalos donde lo pide la sección 6.

## 2. Entorno

- **Windows x64**, Node 24, pnpm. Vercel compila en Linux. Todo script del proyecto debe correr en ambos: escríbelos en TypeScript y ejecútalos con `tsx`. Nada de `.sh`, `rm -rf`, `export VAR=` ni variables en línea dentro de `package.json` (usa `cross-env` o `dotenv-cli` si hace falta). Rutas con `path.join`.
- `.gitattributes` y `.gitignore` ya existen. Respétalos y amplía `.gitignore` si hace falta, nunca lo recortes.
- Hora de referencia: **America/Lima**. Obtenla con `node -e "console.log(new Date().toLocaleString('es-PE',{timeZone:'America/Lima'}))"` al abrir y al cerrar cada fase y escríbela en `PROGRESS.md`.
- **Secretos** en `.env.local` (rama `dev` de Neon, API de Anthropic, pepper, código de evaluación). No lo abras con herramientas de lectura ni lo imprimas: los scripts lo cargan solos. Para comprobar variables imprime solo nombres y "presente" o "ausente".
- Valores **no secretos** que falten (precios por MTok, presupuestos, TTL): ponlos como valores por defecto en la configuración del proyecto, tomados de la documentación oficial, con fuente y fecha en `DECISIONS.md`. Una variable de entorno los reemplaza si existe.
- Instala con `pnpm add` o `pnpm add -D` y ejecuta con `pnpm exec`. Evita `npx` y `pnpm dlx` de paquetes no declarados. Si necesitas un generador (shadcn, drizzle-kit, Playwright), agrégalo primero como dependencia de desarrollo.
- La raíz ya tiene `docs/`, `.claude/`, `.gitignore` y `.gitattributes`. No uses generadores que exijan carpeta vacía en la raíz: arma el proyecto a mano o genera en una carpeta temporal y copia.

## 3. Fuentes

- **PDF del plan:** léelo con un subagente y deja en `docs/plan/NOTAS_PDF.md` un resumen fiel de las páginas que pide la sección 3 del BUILD_PROMPT, con número de página. Después consulta las notas y vuelve al PDF solo para una página concreta.
- **`docs/design/`:** exportes aprobados de Claude Design (`Brand Board.html`, `Artboards.dc.html`, `Prototype.dc.html`, `Console`, `Landing`, `Mobile`, `AG Pill`, `AG Seal`; `support.js` es su runtime y los `.thumbnail` se ignoran). Son la referencia visual de cada pantalla: replica composición, jerarquía, textos y tokens con componentes reales de React. No copies su runtime ni su markup a la app. Si difieren de `UI_UX_PROMPT.md` en tokens o reglas, manda `UI_UX_PROMPT.md`.
- Un subagente lee esos exportes y escribe `docs/design/DESIGN_PLAN.md` (el plan que pide el UI_UX_PROMPT) con pantallas, componentes, textos y tokens. Construye la interfaz desde ese plan.
- Las huellas que aparecen en los diseños (`3f9a21c7…`, `b7710e2a…`) son ilustrativas. La app muestra la huella real (SHA-256 del JSON canónico, sección 8.4) y el sello se deriva de esa huella real.

## 4. Ramas, despliegue y migraciones

- Trabaja en la rama **`dev`**. Commits pequeños con mensajes convencionales. Push a `origin dev` al cerrar cada subtarea importante (es tu respaldo remoto).
- Cada push a `dev` genera un preview en Vercel que usa la rama `dev` de Neon. Los previews tienen la protección de Vercel activada: comprueba que el build quede en *Ready* (`vercel ls` o `vercel inspect` si la CLI está enlazada), pero no corras `smoke` contra un preview.
- **Producción = `main`.** Llevas `dev` a `main` (merge fast-forward y push) solo al cerrar una fase con `pnpm verify` en verde. Después corres `pnpm smoke --base-url <URL de producción>` y anotas el resultado. La Fase 0 hace el primer despliegue a producción.
- **Migraciones de producción:** configura en `vercel.json` el comando de build `pnpm db:migrate && pnpm build`. Así la rama `main` de Neon se migra sola en cada despliegue con la cadena directa que los humanos cargaron en Vercel. Tú nunca usas credenciales de producción en local.
- Migraciones siempre con archivos generados (`drizzle-kit generate` y `db:migrate`), nunca `drizzle-kit push`. Después del primer despliegue a producción, solo cambios aditivos: nada de `DROP`, renombres destructivos ni cambios de tipo con pérdida.
- Las variables de entorno de Vercel las configuran los humanos. Si falta alguna, anótala en `BLOQUEOS.md`; no la escribas tú.

## 5. Ciclo de cada fase

1. Hora de Lima y fase en curso en el bloque "Estado actual" de `PROGRESS.md`.
2. Relee solo las secciones del BUILD_PROMPT y del UI_UX_PROMPT que toca la fase.
3. Escribe la lista de subtareas de la fase en `PROGRESS.md`.
4. Dominio y reglas de dinero o seguridad: prueba primero, código después. El resto: código y pruebas en el mismo commit.
5. Tras cada subtarea: pruebas afectadas, commit, push a `dev`, `PROGRESS.md` al día.
6. Cierre de fase: `pnpm verify` completo con su salida visible en la conversación, la verificación crítica que corresponda (sección 6), merge a `main` y `smoke`, entrada en `PROGRESS.md` con la evidencia (comandos y resultados) y lo que deben probar los humanos en `PARA_HUMANOS.md`.
7. Compara la hora con la sección 8, recorta si vas tarde y empieza la fase siguiente.

**`pnpm verify`** (lo creas en la Fase 0 y lo mantienes siempre): `typecheck` (`tsc --noEmit`), `lint`, `test` (Vitest: unidad e integración contra Neon `dev`), `db:seed-check` y `build`. Desde la Fase 7 incluye también `secrets-scan`. Ninguna fase se cierra con `verify` en rojo, y ninguna fase rompe una anterior.

## 6. Verificaciones críticas (VC)

En estos puntos el dinero o la seguridad dependen de que esté bien. Además de `pnpm verify`, demuestra con pruebas lo que dice la tabla y pide una **revisión independiente** al subagente indicado, pasándole el rango de commits, las secciones del spec y estos criterios.

| ID | Fase | Qué demuestras con pruebas | Revisión |
|---|---|---|---|
| VC1 Dinero | 1 | `Money` con `bigint` en todas las capas y `{ currency, minor: string }` en DTO. Conversión solo con cotización explícita. Formato `USD 2,860.00`. Prueba de arquitectura: el dominio no importa `next`, `drizzle-orm`, `pg` ni `@anthropic-ai/sdk`, y no hay `parseFloat`, `toFixed` ni `Number(` sobre montos en `src/domain` ni en los mappers. | revisor |
| VC2 Motor de políticas | 1 | Escenario base con los números exactos de la sección 6: A fuera por 72 h, C por neto CNY 19,800.00, E por receptor no permitido; con 48 h gana B (débito 2,860.00, saldo 2,140.00); con 6 h gana D (2,880.00, saldo 2,120.00). Reserva USD 1,800.00 intacta y tope USD 2,900.00. Misma entrada, misma salida. | revisor |
| VC3 Consentimiento | 1 | Huella estable para el mismo payload canónico y distinta ante cualquier cambio material. Una aprobación solo vale para su `planId`, `planVersion` y huella, y vence. Alcance A3: recotizar solo si el débito sigue ≤ máximo y la reserva se conserva; si no, bloqueo y nueva aprobación. | revisor |
| VC4 Ejecutor y conciliación (G1) | 2 | Intento persistido antes de enviar. Misma clave y mismo contenido devuelve lo existente; contenido distinto, 409. Dos ejecuciones concurrentes reales (promesas en paralelo contra Neon `dev`) producen un solo débito. Respuesta perdida: `UNKNOWN`, conciliación del mismo intento, ningún pago nuevo. `UNKNOWN` nunca habilita otro pago. Falla confirmada libera la retención una sola vez. N01 y O01 a O08. | revisor; segunda ronda si hubo críticos |
| VC5 Migraciones | 2 y cada cambio de esquema | Muestra el SQL generado. Se aplica sobre una base vacía (esquema temporal en `dev`) y sobre la existente sin pérdida de datos. | sin revisor |
| VC6 Sesiones y acceso (A4) | 3 | Rol, actor y espacio salen solo de la sesión del servidor. Token guardado como hash con pepper. El código de evaluación crea un espacio con los tres roles y sesiones de 14 días. Cookies `HttpOnly`, `Secure` y `SameSite`. S03 y S06 a S09. | auditor-seguridad |
| VC7 Interfaz | 4 | T1 completa solo con clics en local, comprobada con un script mínimo de Playwright (no es la suite E2E de P2). Capturas a 1440 × 900 y 390 × 844, en claro y oscuro, comparadas con `docs/design/` y corregidas. Todas las superficies rotulan los datos como sintéticos. | revisor (con las capturas) |
| VC8 Agente (G2) | 5 | Llamada real con la configuración 13.1, herramientas `strict`. El modelo no tiene herramientas de aprobación, límites, destinatarios, reloj ni fallas. Historial según 13.5, sin errores 400 en 20 turnos seguidos. Presupuesto y salida segura. T1 completa por chat en producción. | revisor |
| VC9 Seguridad completa (G3) | 7 | S01 a S16 en verde con su categoría oficial; encabezados y CSP; `secrets-scan`. El auditor intenta romper la API y el agente en local con las cuatro categorías; cada falla que encuentre se convierte primero en prueba de regresión y después se corrige. | auditor-seguridad |
| VC10 Resultados (G4) | 8 | Cada número de `EVALUATION.md`, `SECURITY_SELF_ASSESSMENT.md` y `docs/results/RESULTS.md` sale de un archivo de `docs/results/` o `docs/evidence/` con commit y fecha. Nada copiado a mano. | revisor (contrasta documentos con archivos) |
| VC11 Cierre (G5) | 9 | Clon del repo en una carpeta temporal siguiendo solo el README (`pnpm install`, `db:migrate`, `test`) sin pasos ocultos. `secrets-scan`, `smoke` en producción y tag. | revisor (lee el README como alguien nuevo) |

**Reglas de la revisión**
- El subagente recibe el diff (`git diff <base>..HEAD`), las secciones del spec y los criterios. No recibe tu razonamiento.
- Solo cuentan hallazgos que afecten corrección, dinero, seguridad o requisitos del spec, con severidad `crítico`, `alto`, `medio` o `bajo`. Corriges críticos y altos, vuelves a correr `verify` y pides una segunda ronda solo si hubo críticos. Medios y bajos van a la sección "Deuda" de `PROGRESS.md`.
- Máximo dos rondas por punto. No sobrediseñes para contentar al revisor.
- Cada revisión queda en `docs/reviews/VCn.md`: hallazgos y qué hiciste con cada uno.

## 7. Reglas firmes durante la corrida

- **Nunca debilites una prueba para que pase:** nada de `.skip`, `.only`, asserts relajados, timeouts inflados para tapar carreras ni números esperados cambiados. Si crees que un valor esperado está mal, compáralo con la sección 6 del BUILD_PROMPT y registra la conclusión en `DECISIONS.md`.
- Nunca inventes resultados. Un comando que no corriste no tiene resultado.
- Si una prueba falla tres veces seguidas con el mismo enfoque, anota la hipótesis en `PROGRESS.md` y cambia de enfoque o aísla el problema con un subagente. Si en 45 minutos no avanza, recorta según las reglas de puertas (sección 19 del BUILD_PROMPT) y sigue con lo de mayor prioridad.
- **No dejes procesos en segundo plano al terminar un turno** (servidor de desarrollo, watchers). Las pruebas que necesiten servidor lo levantan y lo apagan solas (por ejemplo, con `globalSetup` de Vitest). Un proceso colgado frena la evaluación del objetivo.
- Si el modo automático bloquea una acción, no la reintentes con variantes ni busques un rodeo. Anótala en `BLOQUEOS.md` con el comando exacto y sigue con otra tarea.
- **Prohibido:** force push, reescribir historia publicada, borrar ramas o tags remotos, `git reset --hard` o `git clean` sobre trabajo sin commit, cambiar la visibilidad del repo, agregar remotos, tocar las variables de Vercel, usar credenciales de producción en local, enviar correos o formularios, publicar algo fuera del repositorio, borrar la rama `main` de Neon.
- Nada de formularios de inscripción, pasaportes ni constancias de matrícula en el repositorio.
- Costo de IA de la app: respeta los presupuestos de la sección 13.6. Cada conjunto de `eval:agent` se corre una vez (A6). Lleva en `PROGRESS.md` el gasto acumulado estimado.

## 8. Reloj y recortes

Inicio real: domingo 18 hacia las 17:00. Horas objetivo ajustadas (Lima):

| Fase | Objetivo |
|---|---|
| 0 Arranque | dom 18:00 |
| 1 Dominio | dom 20:00 |
| 2 Persistencia y ejecución (G1) | dom 23:00 |
| 3 API, sesiones y acceso | lun 00:30 |
| 4 Interfaz | lun 03:00 |
| 5 Agente (G2) | lun 05:00 |
| 6 Capacidades P1 | lun 09:30 |
| 7 Seguridad completa (G3) | lun 11:30 |
| 8 Evaluación y documentos (G4) | lun 14:00 |
| 9 Cierre (G5) | lun 16:00 |

**Inamovible:**
- **Lunes 12:00:** no entra ninguna capacidad nueva. Solo correcciones, pruebas y documentos.
- **Lunes 14:30:** empieza la Fase 9 pase lo que pase.
- **Lunes 16:00:** tag `v1.0.0-submission` con lo que esté en verde. Después, solo correcciones críticas (seguridad o demo caída), cada una con su prueba y con un tag nuevo `v1.0.1-submission`. El tag anterior no se toca.

Si una fase va más de 90 minutos tarde, aplica las reglas de puertas y recorta en este orden: primero todo P2; después, dentro de P1, lo visual (movimiento de firma, imagen OG, animaciones) y la recotización acotada (A3). Protege hasta el final T3 con mandato (A1), T7 (A2), S13 a S16, D01 a D12 y `tasks:run`. **Nunca recortes P0.** Cada recorte queda en `PROGRESS.md` con su motivo y se declara como no implementado en los documentos.

## 9. Memoria entre compactaciones

- `docs/PROGRESS.md` empieza con un bloque **"Estado actual"** siempre al día: fase, subtarea en curso, siguiente paso exacto, último `verify` (hora y resultado), URL de producción, bloqueos abiertos y gasto de IA estimado. Actualízalo tras cada subtarea, no solo al cerrar la fase.
- `CLAUDE.md` (máximo 60 líneas) incluye: "Modo autónomo: sigue docs/AUTONOMIA.md y no te detengas entre fases", las invariantes de la sección 4 del BUILD_PROMPT, los comandos, y "al reanudar o tras compactar, lee primero CLAUDE.md, docs/AUTONOMIA.md, docs/PROGRESS.md, docs/DECISIONS.md y docs/BLOQUEOS.md".
- Al reanudar o tras una compactación: lee esos archivos, `git log --oneline -15` y `git status`, y sigue desde "siguiente paso".
- Usa subagentes para todo lo que exija leer mucho (PDF, diseños, documentación de librerías, logs largos) y quédate solo con su conclusión.

## 10. Comunicación con los humanos

- **`docs/PARA_HUMANOS.md`:** lo que deben hacer o probar, con hora y lo más urgente arriba. Siempre incluye: "grabar la toma de respaldo del video" cuando se cumpla G2, "grabar el video final" cuando se cumpla G4, cómo entrar a la demo, qué probar en el celular y el código de evaluación como marcador (nunca su valor).
- **`docs/BLOQUEOS.md`:** qué falta, por qué bloquea, qué debe hacer el humano y cómo lo vas a verificar. Cuando se resuelva, márcalo resuelto con la hora.
- No uses ningún otro canal para escribirles.

## 11. Final

Cuando estén cerradas las puertas G1 a G5, o al llegar el lunes 19 a las 16:00:
1. Escribe `docs/INFORME_FINAL.md`: qué está hecho y con qué evidencia (comandos y resultados), tablas N, O, S y D con resultados reales, URL de producción, commit y tag, qué se recortó y por qué, riesgos conocidos, gasto de IA, y lo que los humanos deben hacer antes del cierre oficial (martes 20, 10:59 Lima): video final, slides a partir de `PITCH_OUTLINE.md`, revisar `secrets-scan`, decidir si el PDF del plan y los exportes de diseño quedan en la versión pública y hacer público el repositorio, poner la URL y el código de evaluación en la entrega, y la inscripción.
2. Muestra el informe completo en la conversación.
