import { ACTOR_ROLES } from "@/domain/events/DomainEvent";
import { JsonResponse, apiRoute } from "@/interfaces/http/route";
import { emptyBody } from "@/interfaces/http/schemas";
import { ROLE_COOKIES, sessionCookieHeader, sessionTokens } from "@/interfaces/http/session";

export const dynamic = "force-dynamic";

// Salir de la demo en este navegador: revoca las tres sesiones y borra sus cookies (BUILD_PROMPT 14.1).
export const POST = apiRoute({ roles: ["student", "payer", "evaluator"], mutating: true, body: emptyBody }, async ({ request, app }) => {
  const revoked = await app.access.logout(sessionTokens(request.headers.get("cookie")));
  const cleared = ACTOR_ROLES.map((role) => sessionCookieHeader({ name: ROLE_COOKIES[role], value: "", maxAgeSeconds: 0 }));
  return new JsonResponse(200, { synthetic: true, revokedSessions: revoked }, { "set-cookie": cleared });
});
