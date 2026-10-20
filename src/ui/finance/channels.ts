// Nombre visible de un canal de pago a partir de su código de configuración ("EDU_PAY_PARTNER" → "Edu Pay Partner").
// No hay nombres fijos por ruta: el texto se deriva del código que entrega el servidor.

const ACRONYMS = new Set(["FX", "ACH", "SWIFT"]);

export function channelName(channel: string): string {
  return channel
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}
