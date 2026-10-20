import type { Repositories } from "@/domain/ports/Repositories";
import type { VirtualInstant } from "@/domain/time/Instant";

export interface SeededWorkspace {
  readonly studentActorId: string;
  readonly payerActorId: string;
  readonly evaluatorActorId: string;
}

/** Siembra un espacio a partir de un escenario configurado (BUILD_PROMPT 6.3). */
export interface WorkspaceSeederPort {
  /** Datos propios, dentro de la transacción de creación. */
  seed(repos: Repositories, workspaceId: string, scenarioId: string, start: VirtualInstant): Promise<SeededWorkspace>;
  /** Historia de los simuladores (tablas propias), después de confirmar la transacción. */
  seedSimulators(workspaceId: string, scenarioId: string, start: VirtualInstant): Promise<void>;
  startOf(scenarioId: string): VirtualInstant;
  isKnownScenario(scenarioId: string): boolean;
}

/** Parámetros de un escenario que necesita la aplicación (vienen de la configuración, no del código). */
export interface ScenarioCatalogPort {
  acceptedTuitionChannels(scenarioId: string): readonly string[];
  approvalValidityHours(scenarioId: string): number;
  defaultTargetArrivalHours(scenarioId: string): number;
  scenarios(): readonly { readonly id: string; readonly label: string; readonly description: string }[];
}
