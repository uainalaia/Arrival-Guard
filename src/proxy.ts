import { NextResponse, type NextRequest } from "next/server";

// CSP con nonce por petición (BUILD_PROMPT 14.1, guía oficial de Next.js). Scripts: solo los del propio sitio con el
// nonce de esta respuesta ('strict-dynamic'); nada de inline sin nonce ni eval en producción. Estilos con
// 'unsafe-inline' porque los componentes usan atributos style para anchos y tamaños (DEC-017); los estilos no
// ejecutan código. Sin marcos (frame-ancestors 'none'), sin plugins y formularios solo al propio origen.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const isLocal = request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isLocal ? [] : ["upgrade-insecure-requests"]),
  ];
  const csp = directives.join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|brand).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
