import { apiRoute, clientIp } from "@/interfaces/http/route";
import { emptyBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";
// T8 espera al modelo (hasta 25 s más una llamada); las demás corren de a cuatro mientras tanto.
export const maxDuration = 60;

// Consola del evaluador, "Run T1 to T8" (UI_UX 11.5): cada tarea en un espacio nuevo y aislado, juzgada por el servidor.
export const POST = apiRoute({ roles: ["evaluator"], mutating: true, body: emptyBody }, async ({ actor, request, app }) => ({
  synthetic: true,
  ...(await app.scriptedTasks.execute(actor, { originHash: app.hashForStorage("ip", clientIp(request)) })),
}));
