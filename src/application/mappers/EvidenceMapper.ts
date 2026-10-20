import type { MoneyDTO } from "../dto/MoneyDTO";
import type { EvidenceSnapshot } from "../usecases/GetEvidenceUseCase";
import { moneyText } from "./CaseStateMapper";
import { EventMapper } from "./CaseViewMapper";
import { MoneyMapper } from "./MoneyMapper";

// Expediente de evidencia (BUILD_PROMPT 16.6). Sin secretos y con todo enmascarado: las cuentas con 4 dígitos (ya en
// los registros) y las claves de idempotencia recortadas a 12 caracteres, también dentro de los payloads.

const KEY_PREFIX = 12;
const truncateKey = (key: string) => (key.length > KEY_PREFIX ? `${key.slice(0, KEY_PREFIX)}…` : key);

/** Copia del payload con toda clave de idempotencia recortada. */
function trimKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(trimKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, k === "idempotencyKey" && typeof v === "string" ? truncateKey(v) : trimKeys(v)]));
  }
  return value;
}

const microsToUsd = (micros: bigint): MoneyDTO => ({ currency: "USD", minor: ((micros + 9_999n) / 10_000n).toString() });

export class EvidenceMapper {
  static toJSON(s: EvidenceSnapshot) {
    const securityBlocks = s.events.filter((e) => e.type === "SECURITY_BLOCK");
    const finalTuition = s.attempts.filter((a) => a.attempt.kind === "TUITION").at(-1) ?? null;
    return {
      synthetic: true,
      notice: "Simulated funds and a fictional university. No real money moves.",
      generatedAtVirtual: s.workspace.virtualNow.toISOString(),
      workspace: { id: s.workspace.id, scenario: s.workspace.scenario, scenarioLabel: s.scenarioLabel, virtualStart: s.workspace.virtualStart.toISOString() },
      people: s.people,
      payerAccount: s.payerAccountMasked,
      obligations: s.obligations.map((o) => ({ obligationId: o.id, reference: o.reference, netDue: MoneyMapper.toDTO(o.netDue), dueAt: o.dueAt.toISOString(), status: o.status })),
      planVersions: s.plans.map((p) => ({
        planId: p.plan.id,
        version: p.plan.version,
        status: p.plan.status,
        targetArrivalAt: p.plan.targetArrivalAt.toISOString(),
        selectedRoute: p.quote ? { routeId: p.quote.routeId, debit: MoneyMapper.toDTO(p.quote.debit), net: MoneyMapper.toDTO(p.quote.net) } : null,
        engine: {
          blockers: p.evaluation.blockers,
          viable: p.evaluation.viable.map((r) => ({ routeId: r.routeId, debit: MoneyMapper.toDTO(r.debit), net: MoneyMapper.toDTO(r.net), arrivalMinutes: r.arrivalMinutes })),
          discarded: p.evaluation.discarded.map((r) => ({ routeId: r.routeId, reasons: r.reasons })),
        },
      })),
      approvals: s.approvals.map((a) => {
        const p = a.toProps();
        return {
          approvalId: p.id,
          subjectType: p.subjectType,
          subjectId: p.subjectId,
          subjectVersion: p.subjectVersion,
          status: p.status,
          fingerprint: p.fingerprint,
          canonicalPayload: p.canonicalPayload,
          grantedAt: p.grantedAt.toISOString(),
          expiresAt: p.expiresAt.toISOString(),
          invalidationReason: p.invalidationReason,
        };
      }),
      mandates: s.mandates.map((m) => {
        const p = m.toProps();
        return { mandateId: p.id, status: p.status, purpose: p.purpose, periodMax: MoneyMapper.toDTO(p.periodMax), periodDays: p.periodDays, expiresAt: p.expiresAt.toISOString(), version: p.version };
      }),
      attempts: s.attempts.map((a) => {
        const p = a.attempt.toProps();
        return {
          attemptId: p.id,
          kind: p.kind,
          subjectId: p.subjectId,
          status: p.status,
          debit: MoneyMapper.toDTO(p.debit),
          idempotencyKey: truncateKey(p.idempotencyKey),
          providerTransferId: p.providerTransferId,
          createdAt: p.createdAt.toISOString(),
          statusChangedAt: a.statusChangedAt.toISOString(),
        };
      }),
      remittances: s.remittances.map((r) => ({
        remittanceId: r.id,
        status: r.status,
        authorization: r.authorization,
        reasons: r.reasons,
        net: MoneyMapper.toDTO(r.net),
        debit: r.quote ? MoneyMapper.toDTO(r.quote.debit) : null,
        routeId: r.quote?.routeId ?? null,
      })),
      refunds: s.refunds.map((c) => {
        const p = c.toProps();
        return { claimId: p.id, status: p.status, amount: MoneyMapper.toDTO(p.amount), verifiedExcess: MoneyMapper.toDTO(p.verifiedExcess), destination: "SOURCE_ACCOUNT", settlement: MoneyMapper.toDTOOrNull(p.settlement) };
      }),
      timeline: s.events.map((e) => ({ ...EventMapper.toDTO(e), payload: trimKeys(e.payload) })),
      securityBlocks: securityBlocks.map((e) => ({ seq: e.seq, virtualAt: e.virtualAt.toISOString(), category: e.payload.category ?? null, reason: e.payload.reason ?? null })),
      finalResult: finalTuition
        ? { tuitionAttemptStatus: finalTuition.attempt.status, debit: MoneyMapper.toDTO(finalTuition.attempt.debit) }
        : { tuitionAttemptStatus: null, debit: null },
      aiUsage: { workspace: microsToUsd(s.aiUsageMicros) },
    };
  }

  /** Versión legible para humanos (?format=md). */
  static toMarkdown(s: EvidenceSnapshot): string {
    const json = EvidenceMapper.toJSON(s);
    const lines: string[] = [];
    lines.push(`# Evidence: ${json.workspace.scenarioLabel}`);
    lines.push("");
    lines.push(`${json.notice} Workspace \`${json.workspace.id}\`, generated at ${json.generatedAtVirtual} (virtual time). Paying account ${json.payerAccount}.`);
    lines.push("");
    lines.push("## Obligations");
    for (const o of json.obligations) lines.push(`- ${o.reference}: ${moneyText(o.netDue)}, due ${o.dueAt}, status ${o.status}`);
    lines.push("");
    lines.push("## Plan versions");
    for (const p of json.planVersions) {
      lines.push(`- Plan ${p.planId.slice(0, 8)} v${p.version}: ${p.status}${p.selectedRoute ? `, route ${p.selectedRoute.routeId}, debit ${moneyText(p.selectedRoute.debit)}` : ""}`);
      for (const d of p.engine.discarded) lines.push(`  - Route ${d.routeId} discarded: ${d.reasons.join(", ")}`);
    }
    lines.push("");
    lines.push("## Approvals");
    for (const a of json.approvals) lines.push(`- ${a.subjectType} v${a.subjectVersion}: ${a.status}, fingerprint \`${a.fingerprint}\`, granted ${a.grantedAt}${a.invalidationReason ? `, ${a.invalidationReason}` : ""}`);
    lines.push("");
    lines.push("## Payments and transfers");
    for (const a of json.attempts) lines.push(`- ${a.kind} ${a.attemptId.slice(0, 8)}: ${a.status}, ${moneyText(a.debit)}, key \`${a.idempotencyKey}\``);
    for (const r of json.remittances) lines.push(`- Transfer ${r.remittanceId.slice(0, 8)}: ${r.status}, ${moneyText(r.net)}${r.debit ? ` for ${moneyText(r.debit)}` : ""}${r.reasons.length ? ` (${r.reasons.join(", ")})` : ""}`);
    for (const c of json.refunds) lines.push(`- Refund ${c.claimId.slice(0, 8)}: ${c.status}, ${moneyText(c.amount)} to the paying account${c.settlement ? `, settled ${moneyText(c.settlement)}` : ""}`);
    lines.push("");
    lines.push("## Security blocks");
    if (json.securityBlocks.length === 0) lines.push("- None");
    for (const b of json.securityBlocks) lines.push(`- #${b.seq} ${b.virtualAt}: ${String(b.category)} (${String(b.reason)})`);
    lines.push("");
    lines.push("## Timeline");
    for (const e of json.timeline) lines.push(`- #${e.seq} ${e.virtualAt} (real ${e.realAt}) ${e.actorRole}: ${e.type}`);
    lines.push("");
    lines.push(`AI usage for this workspace: ${moneyText(json.aiUsage.workspace)}.`);
    lines.push("");
    return lines.join("\n");
  }
}
