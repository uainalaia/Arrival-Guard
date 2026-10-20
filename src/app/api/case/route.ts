import { CaseViewMapper } from "@/application/mappers/CaseViewMapper";
import { apiRoute } from "@/interfaces/http/route";

export const dynamic = "force-dynamic";

// CaseViewDTO filtrado por rol y enmascarado: el estado verdadero del caso, desde el servidor.
export const GET = apiRoute({ roles: ["student", "payer"], mutating: false }, async ({ actor, app }) => {
  return CaseViewMapper.toDTO(await app.caseView.execute(actor));
});
