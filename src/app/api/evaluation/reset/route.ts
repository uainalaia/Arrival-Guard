import { accessResponse } from "@/interfaces/http/access";
import { apiRoute, clientIp } from "@/interfaces/http/route";
import { sessionTokens } from "@/interfaces/http/session";
import { resetBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Consola: espacio nuevo con otro escenario. El anterior se conserva; las cookies pasan al espacio nuevo.
export const POST = apiRoute({ roles: ["evaluator"], mutating: true, body: resetBody }, async ({ actor, body, request, app }) => {
  const access = await app.access.reset(actor, {
    scenario: body.scenario,
    ipHash: app.hashForStorage("ip", clientIp(request)),
    previousTokens: sessionTokens(request.headers.get("cookie")),
  });
  return accessResponse(access, 201);
});
