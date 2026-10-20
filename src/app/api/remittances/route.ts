import { Money } from "@/domain/money/Money";
import { presentRemittance } from "@/interfaces/http/presenters";
import { JsonResponse, apiRoute } from "@/interfaces/http/route";
import { remittanceBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T3: prepara la remesa (ruta y chequeo del permiso permanente). No mueve dinero.
export const POST = apiRoute({ roles: ["student"], mutating: true, body: remittanceBody }, async ({ actor, body, app }) => {
  const record = await app.prepareRemittance.execute(actor, { net: Money.fromDecimal("CNY", body.netAmount), targetArrivalHours: body.targetArrivalHours });
  return new JsonResponse(201, { synthetic: true, remittance: await presentRemittance(app, actor, record.id) });
});
