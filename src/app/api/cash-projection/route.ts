import { CashProjectionMapper } from "@/application/mappers/CaseViewMapper";
import { apiRoute } from "@/interfaces/http/route";
import { cashQuery } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T4: caja por moneda; la beca aparece aparte y nunca se cuenta.
export const GET = apiRoute({ roles: ["student", "payer"], mutating: false, query: cashQuery }, async ({ actor, query, app }) => {
  return CashProjectionMapper.toDTO(await app.projectCash.execute(actor, { arrivalExpensesMinor: query.arrivalExpensesMinor }));
});
