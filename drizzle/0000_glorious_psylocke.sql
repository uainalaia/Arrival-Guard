CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_actor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"balance_minor" bigint NOT NULL,
	"masked_number" text NOT NULL,
	"bank_name" text,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"category" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micros" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version" integer NOT NULL,
	"payer_actor_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"currency" text NOT NULL,
	"max_debit_minor" bigint NOT NULL,
	"reserve_minor" bigint NOT NULL,
	"granted_at_virtual" timestamp with time zone NOT NULL,
	"expires_at_virtual" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"invalidation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conditional_incomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"expected_at_virtual" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"condition" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"user_text" text NOT NULL,
	"assistant_text" text NOT NULL,
	"tools" jsonb NOT NULL,
	"usage" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"type" text NOT NULL,
	"actor_role" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"virtual_at" timestamp with time zone NOT NULL,
	"real_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"used_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expected_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"label" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"student_actor_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"net_due_minor" bigint NOT NULL,
	"reference" text NOT NULL,
	"due_at_virtual" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payer_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"max_tuition_debit_minor" bigint NOT NULL,
	"reserve_minor" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version" integer NOT NULL,
	"obligation_id" uuid,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"approval_id" uuid,
	"mandate_id" uuid,
	"status" text NOT NULL,
	"provider_transfer_id" text,
	"currency" text NOT NULL,
	"debit_minor" bigint NOT NULL,
	"quote_id" text NOT NULL,
	"quote_snapshot" jsonb NOT NULL,
	"created_at_virtual" timestamp with time zone NOT NULL,
	"status_changed_at_virtual" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid NOT NULL,
	"version" integer NOT NULL,
	"workspace_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"obligation_version" integer NOT NULL,
	"status" text NOT NULL,
	"target_arrival_at_virtual" timestamp with time zone NOT NULL,
	"selected_route_id" text,
	"quote_snapshot" jsonb,
	"evaluation" jsonb NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"approval_requested_at_virtual" timestamp with time zone,
	"approval_expires_at_virtual" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_plans_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "pending_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "processed_provider_events" (
	"workspace_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_provider_events_workspace_id_provider_event_id_pk" PRIMARY KEY("workspace_id","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"masked_account" text NOT NULL,
	"currency" text NOT NULL,
	"verified" boolean NOT NULL,
	"account_status" text DEFAULT 'OPEN' NOT NULL,
	"added_by_actor_id" uuid
);
--> statement-breakpoint
CREATE TABLE "refund_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"excess_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"status" text NOT NULL,
	"institution_claim_id" text,
	"idempotency_key" text,
	"settlement_currency" text,
	"settlement_minor" bigint,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remittances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mandate_id" uuid,
	"recipient_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"net_currency" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"route_id" text,
	"quote_snapshot" jsonb,
	"evaluation" jsonb,
	"debit_currency" text NOT NULL,
	"debit_minor" bigint,
	"target_arrival_at_virtual" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"authorization" text,
	"approval_id" uuid,
	"approval_expires_at_virtual" timestamp with time zone,
	"created_by_actor_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at_virtual" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sim_institution_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"transfer_id" text,
	"currency" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"owed_minor" bigint NOT NULL,
	"status" text NOT NULL,
	"expected_credit_at_virtual" timestamp with time zone NOT NULL,
	"credited_at_virtual" timestamp with time zone,
	"receipt_id" text,
	"notice" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_institution_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"claim_ref" text NOT NULL,
	"reference" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"destination_account_ref" text NOT NULL,
	"status" text NOT NULL,
	"submitted_at_virtual" timestamp with time zone NOT NULL,
	"review_at_virtual" timestamp with time zone NOT NULL,
	"settles_at_virtual" timestamp with time zone NOT NULL,
	"settlement_currency" text NOT NULL,
	"settlement_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_provider_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"transfer_id" text NOT NULL,
	"type" text NOT NULL,
	"debit_currency" text NOT NULL,
	"debit_minor" bigint NOT NULL,
	"emitted_at_virtual" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_provider_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"route_id" text NOT NULL,
	"channel" text NOT NULL,
	"receiver_id" text NOT NULL,
	"debit_currency" text NOT NULL,
	"debit_minor" bigint NOT NULL,
	"net_currency" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"arrival_minutes" integer NOT NULL,
	"quoted_at_virtual" timestamp with time zone NOT NULL,
	"expires_at_virtual" timestamp with time zone NOT NULL,
	"provider_message" text,
	"requote_of" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_provider_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"debit_currency" text NOT NULL,
	"debit_minor" bigint NOT NULL,
	"accepted_at_virtual" timestamp with time zone,
	"expected_arrival_at_virtual" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_mandates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payer_actor_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"recipient_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"period_max_minor" bigint NOT NULL,
	"period_days" integer NOT NULL,
	"expires_at_virtual" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scenario" text NOT NULL,
	"virtual_now" timestamp with time zone NOT NULL,
	"virtual_start" timestamp with time zone NOT NULL,
	"faults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_seq" bigint DEFAULT 0 NOT NULL,
	"created_by_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_payer_actor_id_actors_id_fk" FOREIGN KEY ("payer_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_incomes" ADD CONSTRAINT "conditional_incomes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earmarks" ADD CONSTRAINT "earmarks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earmarks" ADD CONSTRAINT "earmarks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_expenses" ADD CONSTRAINT "expected_expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_student_actor_id_actors_id_fk" FOREIGN KEY ("student_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_source_account_id_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_policies" ADD CONSTRAINT "payer_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_policies" ADD CONSTRAINT "payer_policies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_provider_events" ADD CONSTRAINT "processed_provider_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_claims" ADD CONSTRAINT "refund_claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_claims" ADD CONSTRAINT "refund_claims_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_claims" ADD CONSTRAINT "refund_claims_destination_account_id_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_claims" ADD CONSTRAINT "refund_claims_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_source_account_id_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_institution_ledger" ADD CONSTRAINT "sim_institution_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_institution_refunds" ADD CONSTRAINT "sim_institution_refunds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_provider_events" ADD CONSTRAINT "sim_provider_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_provider_quotes" ADD CONSTRAINT "sim_provider_quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_provider_transfers" ADD CONSTRAINT "sim_provider_transfers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_mandates" ADD CONSTRAINT "standing_mandates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_mandates" ADD CONSTRAINT "standing_mandates_payer_actor_id_actors_id_fk" FOREIGN KEY ("payer_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_mandates" ADD CONSTRAINT "standing_mandates_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_workspace_kind_uq" ON "accounts" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "actors_workspace_role_uq" ON "actors" USING btree ("workspace_id","role");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_workspace_idx" ON "ai_usage" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "approvals_subject_idx" ON "approvals" USING btree ("workspace_id","subject_id","subject_version");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_turns_index_uq" ON "conversation_turns" USING btree ("conversation_id","turn_index");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_active_uq" ON "conversations" USING btree ("workspace_id","role") WHERE "conversations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "domain_events_workspace_seq_uq" ON "domain_events" USING btree ("workspace_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "holds_attempt_uq" ON "holds" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payer_policies_account_uq" ON "payer_policies" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_workspace_key_uq" ON "payment_attempts" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_active_per_subject_uq" ON "payment_attempts" USING btree ("subject_id") WHERE "payment_attempts"."status" in ('SUBMITTING','UNKNOWN','PROVIDER_ACCEPTED','PENDING_UNIVERSITY');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_credited_per_obligation_uq" ON "payment_attempts" USING btree ("obligation_id") WHERE "payment_attempts"."status" = 'CREDITED';--> statement-breakpoint
CREATE INDEX "payment_attempts_workspace_obligation_idx" ON "payment_attempts" USING btree ("workspace_id","obligation_id");--> statement-breakpoint
CREATE INDEX "payment_plans_workspace_obligation_idx" ON "payment_plans" USING btree ("workspace_id","obligation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_workspace_idx" ON "sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sim_institution_ledger_reference_idx" ON "sim_institution_ledger" USING btree ("workspace_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "sim_institution_refunds_claim_uq" ON "sim_institution_refunds" USING btree ("workspace_id","claim_ref");--> statement-breakpoint
CREATE INDEX "sim_provider_events_transfer_idx" ON "sim_provider_events" USING btree ("workspace_id","transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sim_provider_transfers_key_uq" ON "sim_provider_transfers" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "workspaces_created_at_idx" ON "workspaces" USING btree ("created_at");