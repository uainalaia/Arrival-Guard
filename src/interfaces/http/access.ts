import type { EvaluationAccess } from "@/application/usecases/OpenEvaluationAccessUseCase";
import { ACTOR_ROLES } from "@/domain/events/DomainEvent";
import { JsonResponse } from "./route";
import { ROLE_COOKIES, sessionCookieHeader } from "./session";

/** Respuesta de acceso: fija las tres cookies de sesión y no devuelve los tokens en el cuerpo. */
export function accessResponse(access: EvaluationAccess, status: number): JsonResponse {
  const maxAgeSeconds = Math.max(0, Math.floor((access.sessionsExpireAt.epochMs - Date.now()) / 1000));
  const cookies = ACTOR_ROLES.map((role) => sessionCookieHeader({ name: ROLE_COOKIES[role], value: access.tokens[role], maxAgeSeconds }));
  return new JsonResponse(
    status,
    {
      synthetic: true,
      workspaceId: access.workspace.workspaceId,
      scenario: access.workspace.scenario,
      roles: [...ACTOR_ROLES],
      virtualNow: access.workspace.virtualNow.toISOString(),
      sessionsExpireAt: access.sessionsExpireAt.toISOString(),
      next: `/w/${access.workspace.workspaceId}?as=student`,
    },
    { "set-cookie": cookies },
  );
}
