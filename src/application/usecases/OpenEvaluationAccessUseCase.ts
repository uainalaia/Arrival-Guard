import { ACTOR_ROLES, type ActorRole } from "@/domain/events/DomainEvent";
import type { RealInstant } from "@/domain/time/Instant";
import { requireRole, type ActorContext } from "../ActorContext";
import { RateLimitedError, UnauthenticatedError } from "../errors/ApplicationError";
import type { AccessCodePort, RateLimiterPort, SessionPort } from "../ports/SessionPort";
import type { CreateEvaluationWorkspaceUseCase, CreatedWorkspace } from "./CreateEvaluationWorkspaceUseCase";

export interface EvaluationAccessConfig {
  readonly sessionTtlHours: number;
  readonly perIpPerHour: number;
  readonly perDay: number;
  /** Prefijo de las claves de los contadores (las pruebas usan el suyo). */
  readonly keyPrefix: string;
}

export interface EvaluationAccess {
  readonly workspace: CreatedWorkspace;
  readonly tokens: Readonly<Record<ActorRole, string>>;
  readonly sessionsExpireAt: RealInstant;
}

/**
 * Acceso del jurado (enmienda A4): con el código de evaluación se crea un espacio con los tres roles listos
 * (estudiante, pagador y consola de evaluación) en el mismo navegador, con sesiones de 14 días.
 * Límites: 20 intentos por hora por IP (con hash) y 200 espacios por día en total.
 */
export class OpenEvaluationAccessUseCase {
  constructor(
    private readonly createWorkspace: CreateEvaluationWorkspaceUseCase,
    private readonly sessions: SessionPort,
    private readonly limiter: RateLimiterPort,
    private readonly accessCode: AccessCodePort,
    private readonly config: EvaluationAccessConfig,
  ) {}

  async open(command: { readonly accessCode: string; readonly scenario: string; readonly ipHash: string; readonly previousTokens?: readonly string[] }): Promise<EvaluationAccess> {
    await this.limitPerIp(command.ipHash);
    if (!this.accessCode.verify(command.accessCode)) throw new UnauthenticatedError("That evaluation code is not valid.");
    const access = await this.createWithSessions(command.scenario, command.ipHash);
    await this.revokeTokens(command.previousTokens ?? []);
    return access;
  }

  /**
   * Consola del evaluador: espacio nuevo con otro escenario. El anterior se conserva intacto, pero sus sesiones en
   * este navegador se revocan. Usa el mismo límite por IP que el acceso, para que nadie agote el cupo diario en bucle.
   */
  async reset(actor: ActorContext, command: { readonly scenario: string; readonly ipHash: string; readonly previousTokens?: readonly string[] }): Promise<EvaluationAccess> {
    requireRole(actor, "evaluator");
    await this.limitPerIp(command.ipHash);
    const access = await this.createWithSessions(command.scenario, command.ipHash);
    await this.revokeTokens(command.previousTokens ?? []);
    return access;
  }

  /** Salir: revoca las sesiones de este navegador (BUILD_PROMPT 14.1). */
  async logout(tokens: readonly string[]): Promise<number> {
    return this.revokeTokens(tokens);
  }

  private async limitPerIp(ipHash: string): Promise<void> {
    const perIp = await this.limiter.hit(`${this.config.keyPrefix}:ip:${ipHash}`, 3600, this.config.perIpPerHour);
    if (!perIp.allowed) throw new RateLimitedError("Too many attempts from this network. Try again later.", perIp.retryAfterSeconds);
  }

  private async revokeTokens(tokens: readonly string[]): Promise<number> {
    let revoked = 0;
    for (const token of tokens) {
      const session = await this.sessions.resolve(token);
      if (!session) continue;
      await this.sessions.revoke(session.id);
      revoked++;
    }
    return revoked;
  }

  private async createWithSessions(scenario: string, ipHash: string): Promise<EvaluationAccess> {
    const daily = await this.limiter.hit(`${this.config.keyPrefix}:daily`, 86_400, this.config.perDay);
    if (!daily.allowed) throw new RateLimitedError("The daily limit of evaluation workspaces was reached. Try again tomorrow.", daily.retryAfterSeconds);
    const workspace = await this.createWorkspace.execute({ scenario, ipHash });
    const actorIds: Record<ActorRole, string> = {
      student: workspace.actors.studentActorId,
      payer: workspace.actors.payerActorId,
      evaluator: workspace.actors.evaluatorActorId,
    };
    const tokens = {} as Record<ActorRole, string>;
    let sessionsExpireAt: RealInstant | null = null;
    for (const role of ACTOR_ROLES) {
      const issued = await this.sessions.issue({ workspaceId: workspace.workspaceId, actorId: actorIds[role], role, ttlHours: this.config.sessionTtlHours });
      tokens[role] = issued.token;
      sessionsExpireAt = issued.session.expiresAt;
    }
    return { workspace, tokens, sessionsExpireAt: sessionsExpireAt! };
  }
}
