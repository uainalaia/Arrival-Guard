import { apiRoute } from "@/interfaces/http/route";
import { faultBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

export const POST = apiRoute({ roles: ["evaluator"], mutating: true, body: faultBody }, async ({ actor, body, app }) => {
  const result = await app.injectFault.execute(actor, { fault: body.fault, enabled: body.enabled });
  const workspace = await app.deps.uow.read.workspaces.get(actor.workspaceId);
  return { synthetic: true, fault: result.fault, enabled: result.enabled, faults: workspace?.faults ?? {} };
});
