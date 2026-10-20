/** Hash criptográfico. El dominio arma el contenido; la infraestructura calcula SHA-256. */
export interface HasherPort {
  sha256Hex(input: string): string;
}
