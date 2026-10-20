import type { IdGeneratorPort, RealClockPort } from "@/domain/ports/ClockPort";
import type { HasherPort } from "@/domain/ports/HasherPort";
import type { InstitutionPort } from "@/domain/ports/InstitutionPort";
import type { PaymentProviderPort } from "@/domain/ports/PaymentProviderPort";
import type { UnitOfWork } from "@/domain/ports/Repositories";
import type { ScenarioCatalogPort, WorkspaceSeederPort } from "./ports/WorkspaceSeederPort";

/** Puertos que reciben los casos de uso. La raíz de composición (infraestructura) los arma. */
export interface AppDeps {
  readonly uow: UnitOfWork;
  readonly provider: PaymentProviderPort;
  readonly institution: InstitutionPort;
  readonly hasher: HasherPort;
  readonly ids: IdGeneratorPort;
  readonly scenarios: ScenarioCatalogPort;
  readonly seeder: WorkspaceSeederPort;
  readonly realClock: RealClockPort;
}
