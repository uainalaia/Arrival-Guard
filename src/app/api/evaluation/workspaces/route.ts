import { accessResponse } from "@/interfaces/http/access";
import { apiRoute, clientIp } from "@/interfaces/http/route";
import { sessionTokens } from "@/interfaces/http/session";
import { createWorkspaceBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Acceso del jurado (A4): código de evaluación y escenario. Crea el espacio y las tres sesiones (cookies).
export const POST = apiRoute({ roles: "public", mutating: true, body: createWorkspaceBody }, async ({ body, request, app }) => {
  const access = await app.access.open({
    accessCode: body.accessCode,
    scenario: body.scenario,
    ipHash: app.hashForStorage("ip", clientIp(request)),
    previousTokens: sessionTokens(request.headers.get("cookie")),
  });
  return accessResponse(access, 201);
});
