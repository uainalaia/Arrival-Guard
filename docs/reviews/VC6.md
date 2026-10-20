# VC6 Sesiones y acceso (A4): revisión independiente

- **Fecha:** domingo 18 de octubre, de 19:56 a 20:15 (Lima). **Revisor:** subagente `auditor-seguridad`.
- **Rango:** `d7cc287..bfc44c7` (Fase 3). **Spec:** BUILD_PROMPT 3 (A4), 4.3, 9.3, 11, 13.6, 14.1 y 14.2. **Criterios:** AUTONOMIA 6, VC6.
- **Método del auditor:** 39 ataques propios en `tmp/audit/` contra Neon `dev` (dos corridas, mismos resultados), 11 comprobaciones HTTP contra `next dev` en el puerto 3200 y una revisión de 390 sesiones de 130 espacios en la base. No tocó código de la app ni abrió `.env.local`; las comparaciones con secretos se redujeron a booleanos.
- **Veredicto:** sin hallazgos críticos ni altos. Dos medios y seis bajos. Todos se corrigieron con pruebas de regresión.

## Criterios demostrados (según el auditor)

- Rol, actor y espacio salen solo de la sesión: cuerpo con `workspaceId`, `actorId` o `role` da 422 en las 9 rutas que mutan; la query y los encabezados propios no cambian nada; `x-ag-actor` con variantes raras da 401.
- El token se guarda como HMAC-SHA256(pepper, "session:"+token), nunca en claro ni como SHA-256 simple, con 336 h de vida.
- El código de evaluación crea los tres roles: 0 discrepancias de rol o espacio en 390 sesiones.
- Cookies `HttpOnly; Secure; SameSite=Strict; Path=/`, sin `Domain`, con Max-Age de 14 días y sin token en el cuerpo.
- S03 y S06 a S09 en verde con efectos en la base; dobles pagos, pagos durante UNKNOWN, IDOR entre espacios, CSRF en 8 variantes, aprobaciones en paralelo y textos inyectados del proveedor y de la universidad, sin fallas.

## Hallazgos y qué se hizo

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| VC6-1 | medio | Revocar una aprobación invalidada o ya revocada respondía "This payment was already sent" sin ningún intento. | Corregido: `RevokePermissionUseCase` devuelve el estado previo de la aprobación y el del intento que la usó; `RevokeMapper` arma el mensaje con el estado real ("Already revoked", "no longer matches", "expired", acreditado o fallido sin débito) y solo dice "already sent" con un intento en vuelo. Prueba nueva en `tests/api/t6Api.test.ts`. |
| VC6-2 | medio | Los criterios de VC6 no quedaban demostrados por la suite del proyecto (estaban en la auditoría). | Corregido: `tests/security/sessionAuthority.test.ts` con el HMAC recalculado, sesión vencida o revocada sin efectos, tokens falsos, cuerpo, query y encabezados con identidad ajena (422 o sin efecto, con el rol correcto) y vencimiento real. S03 ahora exige además 1 intento (el histórico) y 0 retenciones. |
| VC6-3 | bajo | La verificación de Origin aceptaba el host de `X-Forwarded-Host`. | Corregido: solo hosts del servidor (la URL de la petición, `APP_BASE_URL` y las URL de Vercel). Prueba: Origin ajeno con `X-Forwarded-Host` ajeno da 422 y la política sigue en la versión 1. |
| VC6-4 | bajo | Una cookie mal codificada daba 500. | Corregido: `readCookie` devuelve null y termina en 401. Prueba con `ag_student=%E0%A4%A`. |
| VC6-5 | bajo | `/api/session` informaba el vencimiento del espacio (30 días) como el de la sesión. | Corregido: el contexto del actor lleva el vencimiento real de la sesión. Prueba: diferencia menor a 1 s con `sessions.expires_at`. |
| VC6-6 | bajo | La vista de aprobación estaba abierta al estudiante con la huella completa, y la sección 11 dice "payer". | Corregido: la vista es solo del pagador (S07 toma la huella de la vista del pagador). Prueba: el estudiante recibe 403 y ninguna huella. |
| VC6-7 | bajo | El reinicio de la consola no aplicaba el límite por IP: se podía agotar el cupo diario en bucle. | Corregido: el reinicio usa el mismo límite por IP que el acceso. Prueba con un límite de 2 por hora: el segundo reinicio da RATE_LIMITED. |
| VC6-8 | bajo | No había forma de revocar sesiones: al abrir otro espacio o reiniciar, los tokens anteriores seguían vigentes 14 días. | Corregido: abrir un espacio o reiniciar revoca las sesiones que trae la petición; `POST /api/session/logout` revoca las tres y borra las cookies. Pruebas: la cookie anterior da 401 y las 3 sesiones quedan con `revoked_at`; salir deja las tres en 401 y 3 cookies con Max-Age=0. |

## Observaciones del auditor y qué se hizo

- **Pestaña de otro espacio:** la API no comparaba el espacio de la sesión con el de la página. Hecho: la interfaz manda `x-ag-workspace` y la API responde 409 `WORKSPACE_MISMATCH` si no coincide (salvo `GET /api/session`, que es como la pestaña sabe a qué espacio pertenece). Prueba en `sessionAuthority.test.ts`.
- **`AGENTS.md` generado por `next dev`:** se apagó con `agentRules: false` en `next.config.ts`.
- **Límite por IP con `X-Forwarded-For`:** en local se esquiva rotando el encabezado; en Vercel lo fija la plataforma. Queda en la Deuda de PROGRESS (endurecer con `ipAddress()` de `@vercel/functions`).
- **Clave de idempotencia completa en la bitácora del evaluador:** el estudiante y el pagador solo ven el prefijo de 12. Se tiene en cuenta en la Fase 5: no entra en el estado que recibe el modelo.
- **CSP:** pendiente para la Fase 7 (los demás encabezados ya están).

## Evidencia después de las correcciones

- `pnpm exec vitest run tests/api tests/security`: 5 archivos, 31 pruebas en verde.
- El cierre de la Fase 3 en `PROGRESS.md` incluye el `pnpm verify` completo.
