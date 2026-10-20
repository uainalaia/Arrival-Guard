import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Esquema de BUILD_PROMPT 10. Cada tabla de negocio lleva workspace_id y toda consulta filtra por él.
// Dinero en bigint (unidades menores) más su moneda. Horas virtuales en columnas *_virtual.
// Después del primer despliegue con tablas, solo cambios aditivos (AUTONOMIA 4).

const money = (name: string) => bigint(name, { mode: "bigint" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    scenario: text("scenario").notNull(),
    virtualNow: ts("virtual_now").notNull(),
    virtualStart: ts("virtual_start").notNull(),
    faults: jsonb("faults").$type<Record<string, boolean>>().notNull().default({}),
    eventSeq: bigint("event_seq", { mode: "number" }).notNull().default(0),
    createdByIpHash: text("created_by_ip_hash"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("workspaces_created_at_idx").on(t.createdAt)],
);

export const actors = pgTable(
  "actors",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    role: text("role").notNull(),
    displayName: text("display_name").notNull(),
  },
  (t) => [uniqueIndex("actors_workspace_role_uq").on(t.workspaceId, t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    actorId: uuid("actor_id").notNull().references(() => actors.id),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_workspace_idx").on(t.workspaceId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    ownerActorId: uuid("owner_actor_id").notNull().references(() => actors.id),
    kind: text("kind").notNull(),
    currency: text("currency").notNull(),
    balanceMinor: money("balance_minor").notNull(),
    maskedNumber: text("masked_number").notNull(),
    bankName: text("bank_name"),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("accounts_workspace_kind_uq").on(t.workspaceId, t.kind)],
);

export const earmarks = pgTable("earmarks", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  purpose: text("purpose").notNull(),
  currency: text("currency").notNull(),
  amountMinor: money("amount_minor").notNull(),
  usedMinor: money("used_minor").notNull().default(sql`0`),
});

export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    attemptId: uuid("attempt_id").notNull(),
    currency: text("currency").notNull(),
    amountMinor: money("amount_minor").notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [uniqueIndex("holds_attempt_uq").on(t.attemptId)],
);

export const payerPolicies = pgTable(
  "payer_policies",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    currency: text("currency").notNull(),
    maxTuitionDebitMinor: money("max_tuition_debit_minor").notNull(),
    reserveMinor: money("reserve_minor").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("payer_policies_account_uq").on(t.accountId)],
);

export const recipients = pgTable("recipients", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  displayName: text("display_name").notNull(),
  maskedAccount: text("masked_account").notNull(),
  currency: text("currency").notNull(),
  verified: boolean("verified").notNull(),
  accountStatus: text("account_status").notNull().default("OPEN"),
  addedByActorId: uuid("added_by_actor_id"),
});

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id),
  studentActorId: uuid("student_actor_id").notNull().references(() => actors.id),
  sourceAccountId: uuid("source_account_id").notNull().references(() => accounts.id),
  currency: text("currency").notNull(),
  netDueMinor: money("net_due_minor").notNull(),
  reference: text("reference").notNull(),
  dueAtVirtual: ts("due_at_virtual").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
});

export const paymentPlans = pgTable(
  "payment_plans",
  {
    id: uuid("id").notNull(),
    version: integer("version").notNull(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    obligationId: uuid("obligation_id").notNull().references(() => obligations.id),
    obligationVersion: integer("obligation_version").notNull(),
    status: text("status").notNull(),
    targetArrivalAtVirtual: ts("target_arrival_at_virtual").notNull(),
    selectedRouteId: text("selected_route_id"),
    quoteSnapshot: jsonb("quote_snapshot"),
    evaluation: jsonb("evaluation").notNull(),
    createdByActorId: uuid("created_by_actor_id").notNull().references(() => actors.id),
    approvalRequestedAtVirtual: ts("approval_requested_at_virtual"),
    approvalExpiresAtVirtual: ts("approval_expires_at_virtual"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.version] }), index("payment_plans_workspace_obligation_idx").on(t.workspaceId, t.obligationId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersion: integer("subject_version").notNull(),
    payerActorId: uuid("payer_actor_id").notNull().references(() => actors.id),
    fingerprint: text("fingerprint").notNull(),
    canonicalPayload: jsonb("canonical_payload").notNull(),
    currency: text("currency").notNull(),
    maxDebitMinor: money("max_debit_minor").notNull(),
    reserveMinor: money("reserve_minor").notNull(),
    grantedAtVirtual: ts("granted_at_virtual").notNull(),
    expiresAtVirtual: ts("expires_at_virtual").notNull(),
    status: text("status").notNull(),
    invalidationReason: text("invalidation_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_subject_idx").on(t.workspaceId, t.subjectId, t.subjectVersion)],
);

export const standingMandates = pgTable("standing_mandates", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  payerActorId: uuid("payer_actor_id").notNull().references(() => actors.id),
  purpose: text("purpose").notNull(),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id),
  currency: text("currency").notNull(),
  periodMaxMinor: money("period_max_minor").notNull(),
  periodDays: integer("period_days").notNull(),
  expiresAtVirtual: ts("expires_at_virtual").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
});

export const remittances = pgTable("remittances", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  mandateId: uuid("mandate_id"),
  recipientId: uuid("recipient_id").notNull().references(() => recipients.id),
  sourceAccountId: uuid("source_account_id").notNull().references(() => accounts.id),
  purpose: text("purpose").notNull(),
  netCurrency: text("net_currency").notNull(),
  netMinor: money("net_minor").notNull(),
  routeId: text("route_id"),
  quoteSnapshot: jsonb("quote_snapshot"),
  evaluation: jsonb("evaluation"),
  debitCurrency: text("debit_currency").notNull(),
  debitMinor: money("debit_minor"),
  targetArrivalAtVirtual: ts("target_arrival_at_virtual").notNull(),
  status: text("status").notNull(),
  authorization: text("authorization"),
  approvalId: uuid("approval_id"),
  approvalExpiresAtVirtual: ts("approval_expires_at_virtual"),
  createdByActorId: uuid("created_by_actor_id").notNull().references(() => actors.id),
  version: integer("version").notNull().default(1),
  createdAtVirtual: ts("created_at_virtual").notNull(),
  createdAt: createdAt(),
});

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    kind: text("kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersion: integer("subject_version").notNull(),
    obligationId: uuid("obligation_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    approvalId: uuid("approval_id"),
    mandateId: uuid("mandate_id"),
    status: text("status").notNull(),
    providerTransferId: text("provider_transfer_id"),
    currency: text("currency").notNull(),
    debitMinor: money("debit_minor").notNull(),
    quoteId: text("quote_id").notNull(),
    quoteSnapshot: jsonb("quote_snapshot").notNull(),
    createdAtVirtual: ts("created_at_virtual").notNull(),
    statusChangedAtVirtual: ts("status_changed_at_virtual").notNull(),
    /** Hora real hasta la que un envío al proveedor está en curso: evita reenvíos simultáneos (VC4-2). */
    submitLeaseUntil: ts("submit_lease_until"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_attempts_workspace_key_uq").on(t.workspaceId, t.idempotencyKey),
    // Un solo intento activo por sujeto (BUILD_PROMPT 10).
    uniqueIndex("payment_attempts_one_active_per_subject_uq")
      .on(t.subjectId)
      .where(sql`${t.status} in ('SUBMITTING','UNKNOWN','PROVIDER_ACCEPTED','PENDING_UNIVERSITY')`),
    // Una obligación acreditada no admite otro intento acreditado.
    uniqueIndex("payment_attempts_one_credited_per_obligation_uq").on(t.obligationId).where(sql`${t.status} = 'CREDITED'`),
    index("payment_attempts_workspace_obligation_idx").on(t.workspaceId, t.obligationId),
  ],
);

export const refundClaims = pgTable("refund_claims", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  obligationId: uuid("obligation_id").notNull().references(() => obligations.id),
  currency: text("currency").notNull(),
  excessMinor: money("excess_minor").notNull(),
  amountMinor: money("amount_minor").notNull(),
  destinationAccountId: uuid("destination_account_id").notNull().references(() => accounts.id),
  status: text("status").notNull(),
  institutionClaimId: text("institution_claim_id"),
  idempotencyKey: text("idempotency_key"),
  settlementCurrency: text("settlement_currency"),
  settlementMinor: money("settlement_minor"),
  version: integer("version").notNull().default(1),
  createdByActorId: uuid("created_by_actor_id").notNull().references(() => actors.id),
  createdAt: createdAt(),
});

export const conditionalIncomes = pgTable("conditional_incomes", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  currency: text("currency").notNull(),
  amountMinor: money("amount_minor").notNull(),
  expectedAtVirtual: ts("expected_at_virtual").notNull(),
  status: text("status").notNull(),
  condition: text("condition").notNull(),
});

export const expectedExpenses = pgTable("expected_expenses", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  label: text("label").notNull(),
  currency: text("currency").notNull(),
  amountMinor: money("amount_minor").notNull(),
  source: text("source").notNull(),
});

export const pendingChanges = pgTable("pending_changes", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  fingerprint: text("fingerprint").notNull(),
  status: text("status").notNull(),
  createdByActorId: uuid("created_by_actor_id").notNull().references(() => actors.id),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

export const domainEvents = pgTable(
  "domain_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    seq: bigint("seq", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    actorRole: text("actor_role").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    payload: jsonb("payload").notNull(),
    virtualAt: ts("virtual_at").notNull(),
    realAt: ts("real_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("domain_events_workspace_seq_uq").on(t.workspaceId, t.seq)],
);

export const processedProviderEvents = pgTable(
  "processed_provider_events",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    providerEventId: text("provider_event_id").notNull(),
    processedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.providerEventId] })],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    role: text("role").notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conversations_one_active_uq").on(t.workspaceId, t.role).where(sql`${t.status} = 'ACTIVE'`)],
);

export const conversationTurns = pgTable(
  "conversation_turns",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    turnIndex: integer("turn_index").notNull(),
    userText: text("user_text").notNull(),
    assistantText: text("assistant_text").notNull(),
    tools: jsonb("tools").notNull(),
    usage: jsonb("usage").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conversation_turns_index_uq").on(t.conversationId, t.turnIndex)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id"),
    category: text("category").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsdMicros: bigint("cost_usd_micros", { mode: "bigint" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt), index("ai_usage_workspace_idx").on(t.workspaceId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// Tablas propias del proveedor simulado.
export const simProviderQuotes = pgTable("sim_provider_quotes", {
  id: text("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  purpose: text("purpose").notNull(),
  routeId: text("route_id").notNull(),
  channel: text("channel").notNull(),
  receiverId: text("receiver_id").notNull(),
  debitCurrency: text("debit_currency").notNull(),
  debitMinor: money("debit_minor").notNull(),
  netCurrency: text("net_currency").notNull(),
  netMinor: money("net_minor").notNull(),
  arrivalMinutes: integer("arrival_minutes").notNull(),
  quotedAtVirtual: ts("quoted_at_virtual").notNull(),
  expiresAtVirtual: ts("expires_at_virtual").notNull(),
  providerMessage: text("provider_message"),
  requoteOf: text("requote_of"),
  createdAt: createdAt(),
});

export const simProviderTransfers = pgTable(
  "sim_provider_transfers",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    failureCode: text("failure_code"),
    debitCurrency: text("debit_currency").notNull(),
    debitMinor: money("debit_minor").notNull(),
    acceptedAtVirtual: ts("accepted_at_virtual"),
    expectedArrivalAtVirtual: ts("expected_arrival_at_virtual"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sim_provider_transfers_key_uq").on(t.workspaceId, t.idempotencyKey)],
);

export const simProviderEvents = pgTable(
  "sim_provider_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    providerEventId: text("provider_event_id").notNull(),
    transferId: text("transfer_id").notNull(),
    type: text("type").notNull(),
    debitCurrency: text("debit_currency").notNull(),
    debitMinor: money("debit_minor").notNull(),
    emittedAtVirtual: ts("emitted_at_virtual").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sim_provider_events_transfer_idx").on(t.workspaceId, t.transferId)],
);

// Tablas propias de la institución simulada.
export const simInstitutionLedger = pgTable(
  "sim_institution_ledger",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    reference: text("reference").notNull(),
    transferId: text("transfer_id"),
    currency: text("currency").notNull(),
    netMinor: money("net_minor").notNull(),
    owedMinor: money("owed_minor").notNull(),
    status: text("status").notNull(),
    expectedCreditAtVirtual: ts("expected_credit_at_virtual").notNull(),
    creditedAtVirtual: ts("credited_at_virtual"),
    receiptId: text("receipt_id"),
    notice: text("notice"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sim_institution_ledger_reference_idx").on(t.workspaceId, t.reference),
    // Una transferencia se acredita una sola vez en el libro (VC4-1).
    uniqueIndex("sim_institution_ledger_transfer_uq").on(t.workspaceId, t.transferId).where(sql`${t.transferId} is not null`),
  ],
);

export const simInstitutionRefunds = pgTable(
  "sim_institution_refunds",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    claimRef: text("claim_ref").notNull(),
    reference: text("reference").notNull(),
    currency: text("currency").notNull(),
    amountMinor: money("amount_minor").notNull(),
    destinationAccountRef: text("destination_account_ref").notNull(),
    status: text("status").notNull(),
    submittedAtVirtual: ts("submitted_at_virtual").notNull(),
    reviewAtVirtual: ts("review_at_virtual").notNull(),
    settlesAtVirtual: ts("settles_at_virtual").notNull(),
    settlementCurrency: text("settlement_currency").notNull(),
    settlementMinor: money("settlement_minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sim_institution_refunds_claim_uq").on(t.workspaceId, t.claimRef)],
);
