import type { RealInstant, VirtualInstant } from "@/domain/time/Instant";
import type { AppDeps } from "../AppDeps";
import { ValidationError } from "../errors/ApplicationError";
import type { SeededWorkspace } from "../ports/WorkspaceSeederPort";
import { event } from "../services/events";

export interface CreateWorkspaceCommand {
  readonly scenario: string;
  /** Hash de la IP de origen (nunca la IP en claro). */
  readonly ipHash: string | null;
}

export interface CreatedWorkspace {
  readonly workspaceId: string;
  readonly scenario: string;
  readonly actors: SeededWorkspace;
  readonly virtualNow: VirtualInstant;
  readonly expiresAt: RealInstant;
}

/** Crea un espacio de evaluación aislado con el escenario pedido (BUILD_PROMPT 6.3 y 11). Nunca toca otros espacios. */
export class CreateEvaluationWorkspaceUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow" | "seeder" | "ids" | "realClock">,
    private readonly workspaceTtlDays = 30,
  ) {}

  async execute(command: CreateWorkspaceCommand): Promise<CreatedWorkspace> {
    if (!this.deps.seeder.isKnownScenario(command.scenario)) throw new ValidationError(`Unknown scenario: ${command.scenario}`);
    const workspaceId = this.deps.ids.newId();
    const start = this.deps.seeder.startOf(command.scenario);
    const createdAt = this.deps.realClock.now();
    const expiresAt = createdAt.plusHours(24 * this.workspaceTtlDays);
    const actors = await this.deps.uow.transaction(async (r) => {
      await r.workspaces.insert({
        id: workspaceId,
        scenario: command.scenario,
        virtualNow: start,
        virtualStart: start,
        faults: {},
        createdAt,
        expiresAt,
        createdByIpHash: command.ipHash,
      });
      const seeded = await this.deps.seeder.seed(r, workspaceId, command.scenario, start);
      await r.events.append(workspaceId, [
        event("WORKSPACE_CREATED", "system", { type: "Workspace", id: workspaceId }, start, { scenario: command.scenario, synthetic: true }),
      ]);
      return seeded;
    });
    await this.deps.seeder.seedSimulators(workspaceId, command.scenario, start);
    return { workspaceId, scenario: command.scenario, actors, virtualNow: start, expiresAt };
  }
}
