import { apiRoute } from "@/interfaces/http/route";
import { advanceClockBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

export const POST = apiRoute({ roles: ["evaluator"], mutating: true, body: advanceClockBody }, async ({ actor, body, app }) => {
  const result = await app.advanceClock.execute(actor, { minutes: body.minutes });
  return { synthetic: true, virtualNow: result.virtualNow.toISOString(), reconciledAttempts: result.reconciled };
});
