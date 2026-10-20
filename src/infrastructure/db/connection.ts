/**
 * Las cadenas de Neon traen `sslmode=require`. `pg` 8 lo trata como `verify-full` y avisa que en `pg` 9
 * pasará a la semántica más débil de libpq. Lo fijamos explícitamente en `verify-full` (DEC-006):
 * mismo comportamiento de hoy, sin el aviso y sin perder la verificación del certificado mañana.
 */
export function normalizeSslMode(connectionString: string): string {
  return connectionString.replace(/([?&])sslmode=(require|prefer|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
