# ArrivalGuard execution evidence

This document explains how to read the evidence files in `docs/evidence/` and the evidence export of a live workspace, and walks through one complete tuition payment (task T1) recorded against production. All data is synthetic: simulated provider, fictional university, synthetic funds.

**How to trust a file.** Every file is written by a script from real responses; none is edited by hand. Each one carries its generation time (`generatedAt`, real UTC time) and, where it applies, the commit and base URL it ran against. The source of truth for money and status is always the **server state** (the case view and the evidence export), not the assistant's text.

## 1. Files in `docs/evidence/`

| File | Produced by | What it contains |
|---|---|---|
| `g2-chat-<timestamp>.json` | `pnpm smoke:chat --base-url <url>` | A T1 payment driven through the chat with the real model: `baseUrl`, `commit` (from `/api/health`), `workspaceId`, `t1` (status read from the server at the end: `visibleStatus`, `attemptStatus`, `receiptId`) and `transcript` (one entry per student message). |
| `agent-turns-<timestamp>.json` | `pnpm ai:turns` | A scripted conversation with the real model against the development database: `model`, `workspaceId`, `turns` (each with `n`, `role`, `message`, `text`, `tools`, `components`, `fallback` and `ms`) and `studentTurnsStored`. |
| `ui-axe.json` | `pnpm ui:check --base-url <url>` | Accessibility and layout check of every captured screen: for each `screen`, the count of `serious` and `critical` axe violations, their rule `ids` and `horizontalOverflowPx`. The screenshots themselves are in `docs/design/screens/`. |
| `phase0-ai-check.json` | `pnpm ai:check` | The first real call to Claude (Phase 0) with the production configuration (`config`: `max_tokens`, `thinking`, `effort`, `tool_choice`, `strictTools`), each API call with its `stop_reason`, content blocks and token `usage`, the `finalText` and `ok`. |
| Task logs from `pnpm tasks:run` | `pnpm tasks:run --base-url <url>` | For each task T1 to T8, the HTTP requests made (method, path, role, status, time). The summary goes to `docs/results/`. |

Fields that appear in transcripts:

- `tools`: the agent tools the server executed in that turn, in order.
- `components`: the cards the server attached to the turn (for example `ROUTES`, `CASH`, `PLAN`, `APPROVAL_REQUESTED`, `PAYMENT`, `SECURITY_BLOCK`). They are built from tool results and server state, not from the model's text.
- `fallback`: `null` when the model answered; otherwise the reason the turn used the safe exit (for example `AI_UNAVAILABLE` or `BUDGET_EXHAUSTED`).
- `text`: the model's reply. It is shown to the user as plain text with minimal markdown; it is not evidence on its own.

Files currently in the folder (facts read from each file):

| File | Ran against | Notes |
|---|---|---|
| `g2-chat-2026-10-19T03-34-06-061Z.json` | `https://arrivalguard.vercel.app`, commit `b3e351c` | Gate G2: T1 by chat in production; `t1.attemptStatus` `CREDITED`, receipt `AU-RC-8555B526`. Walkthrough in section 3. |
| `g2-chat-2026-10-19T03-30-57-623Z.json` | `http://localhost:3000` (commit field `local`) | The same script against a local production build; `t1.attemptStatus` `CREDITED`. |
| `agent-turns-2026-10-19T02-20-43-194Z.json` | Development database, `claude-sonnet-5-5` | 20 turns, student and payer, `fallback` null in all of them. |
| `agent-turns-2026-10-19T02-16-03-857Z.json` | Development database, `claude-sonnet-5-5` | 17 turns, an earlier run of the same script. |
| `agent-turns-2026-10-19T02-08-18-314Z.json` | Development database, `claude-sonnet-5-5` | 1 turn, a quick check. |
| `ui-axe.json` | `http://localhost:3000` (no commit field) | Regenerated on Monday 19 at 20:44 (Lima) with the code of `v1.0.2-submission`: 39 screens, including the console after Run T1 to T8; 0 serious and 0 critical violations and 0 px of horizontal overflow in every entry. The same run passed the six motion checks of `scripts/ui-check.ts` (seal stamped once, Credited animated only live, toast timing, landing board once, reduced motion). |
| `tasks-2026-10-20T02-28-40-513Z.json` | `https://arrivalguard.vercel.app`, commit `c18a91d` (latest code, with interface motion; same server as `172676b`) | The final `pnpm tasks:run` on Monday 19 at 21:28 (Lima): T1 to T8 by HTTP with their checks and request logs, the T8 `transcript` and the console's Run T1 to T8 once (`consoleRun`: HTTP 200, 8 of 8). 8 of 8. |
| `tasks-2026-10-19T17-31-53-049Z.json` | `https://arrivalguard.vercel.app`, commit `172676b` (code of `v1.0.1-submission`) | The `pnpm tasks:run` of `v1.0.1-submission`: T1 to T8 by HTTP with their checks and request logs, the T8 `transcript` and the console's Run T1 to T8 once (`consoleRun`: HTTP 200, 8 of 8). |
| `tasks-2026-10-19T15-29-04-637Z.json` | `https://arrivalguard.vercel.app`, commit `ed1ed75` (tag `v1.0.0-submission`) | The final `pnpm tasks:run` on the deployed commit of the tag: T1 to T8 by HTTP with their checks and request logs, the T8 `transcript` and the console's Run T1 to T8 once (`consoleRun`: HTTP 200, 8 of 8). |
| `tasks-2026-10-19T14-46-39-971Z.json` | `https://arrivalguard.vercel.app`, commit `b7f997a` | `pnpm tasks:run` after the theme button: T1 to T8 by HTTP with their checks and request logs, the T8 `transcript` and the console's Run T1 to T8 once (`consoleRun`: HTTP 200, 8 of 8). |
| `tasks-2026-10-19T06-29-53-054Z.json` | `https://arrivalguard.vercel.app`, commit `75614ed` | `pnpm tasks:run` on the commit of the deterministic and agent runs: T1 to T8 by HTTP with their checks and request logs, the T8 `transcript` (message, reply and tools) and the console's Run T1 to T8 once (`consoleRun`: HTTP 200, 8 of 8). |
| `tasks-2026-10-19T05-29-35-915Z.json` | `https://arrivalguard.vercel.app`, commit `82e72e5` | `pnpm tasks:run`: T1 to T8 by HTTP, each with its checks and request log, and the console's Run T1 to T8 once (`consoleRun`: HTTP 200, 8 of 8). |
| `phase0-ai-check.json` | Anthropic API, `claude-sonnet-5-5` | 2 calls (`tool_use`, then `end_turn`), `ok: true`. |

## 2. The evidence export of a workspace

Every workspace can export its own record:

- In the interface: the **Evidence** button in the top bar (desktop) opens a drawer with the timeline and two downloads, **Download evidence (JSON)** and **Download summary (Markdown)**.
- Over HTTP: `GET /api/evidence` (JSON) or `GET /api/evidence?format=md` (Markdown), with a session cookie and the `x-ag-actor` header (`student`, `payer` or `evaluator`).

The JSON export (`EvidenceMapper.toJSON` in `src/application/mappers/EvidenceMapper.ts`) contains:

| Field | Meaning |
|---|---|
| `synthetic`, `notice` | Always `true` and "Simulated funds and a fictional university. No real money moves." |
| `generatedAtVirtual` | Virtual time of the workspace when exported |
| `workspace`, `people`, `payerAccount` | Scenario, virtual start and names; the paying account masked (for example `•••• 4821`) |
| `obligations` | Tuition reference, net due, due date and status |
| `planVersions` | Every plan version with its status, selected route and the engine evaluation (viable and discarded routes with reason codes) |
| `approvals` | Subject and version, status, full fingerprint and the canonical payload that was signed |
| `mandates` | Standing permission: maximum, period, used amount, status |
| `attempts` | Each payment or transfer attempt with status, debit and the idempotency key cut to 12 characters plus an ellipsis |
| `remittances`, `refunds` | Arrival transfers and refund claims with their status |
| `timeline` | Every domain event in order: `seq`, virtual time, real time, actor role, type and redacted payload |
| `securityBlocks` | Each `SECURITY_BLOCK` with its official category and reason |
| `finalResult` | The final state of the tuition payment |
| `aiUsage` | AI cost recorded for the workspace |

There are no secrets in the export, accounts are masked to the last 4 digits and payloads are redacted (test "JSON y Markdown sin secretos, con cuentas enmascaradas y claves de idempotencia recortadas" in `tests/api/p1Api.test.ts`).

The evaluator console shows the same timeline live, with filters for payments, approvals, security, and clock and faults.

## 3. Walkthrough: T1 by chat in production

File: `docs/evidence/g2-chat-2026-10-19T03-34-06-061Z.json`.

Header:

```json
"generatedAt": "2026-10-19T03:34:06.062Z",
"baseUrl": "https://arrivalguard.vercel.app",
"commit": "b3e351c",
"t1": { "visibleStatus": "CREDITED", "attemptStatus": "CREDITED", "receiptId": "AU-RC-8555B526" }
```

The run was made by `pnpm smoke:chat --base-url https://arrivalguard.vercel.app` (`scripts/chat-smoke.ts`). The script opens a new `base` workspace with the evaluation code (`POST /api/evaluation/workspaces`), which sets the three role cookies. The `t1` block is **not** taken from the chat: the script reads it from `GET /api/case` after the last turn.

### Step 1. The student asks (chat, real model)

> "Pay my tuition without touching the arrival reserve. It must arrive within 48 hours."

- `tools`: `compare_routes`, `project_cash`, `plan_tuition_payment`, `request_payer_approval`.
- `components`: `ROUTES`, `CASH`, `APPROVAL_REQUESTED`, `PLAN`.
- What happened on the server: the policy engine compared routes A to E for a 48 hour target and selected route B, the cheapest viable one; the plan was created and an approval was requested from the payer. No money moved.
- The reply names route B, arrival in about 24 hours, CNY 20,000.00 to the university's registered account ending 0098, a debit of USD 2,860.00 within the USD 2,900.00 limit, and the USD 1,800.00 arrival reserve untouched. These figures match the `base` scenario configuration and test N01 (`tests/integration/t1Flow.test.ts`).
- The model could not approve: the student role has no approval tool.

### Step 2. The payer approves on the fixed screen (not by chat)

Not part of the transcript, because it does not go through the model. The script acts as Carlos's approval screen:

1. `GET /api/approvals/{planId}/view` with the payer session returns the plan version and the fingerprint of the exact terms.
2. `POST /api/approvals` with the payer session and `{ planId, planVersion, fingerprint }`. The server recomputes the fingerprint and stores the approval. [PROGRESS.md](PROGRESS.md) records the response as 201 for this run.

In the interface this is the **Review and approve** button, then **Approve this payment** on the approval document, where the seal appears. The seal is a visual representation of the fingerprint; security comes from server verification.

### Step 3. The student asks to send

> "Carlos approved it. Send the payment now."

- `tools`: `execute_approved_payment`. `components`: `PAYMENT`.
- What happened on the server: the executor checked the approval against the current plan version, persisted the attempt as `SUBMITTING` with a hold and consumed the approval, then sent to the simulated provider with the server-derived key `tuition:{planId}:v{version}:{approvalId}`. The provider accepted, the debit was confirmed once and the attempt moved to `PENDING_UNIVERSITY`.
- "Carlos approved it" was not taken as authority: there really was an active approval for this plan version, which is why the claim was not labelled as an attack and the execution passed the server checks. Without it, the same sentence ends in `APPROVAL_MISSING` and no attempt (test S02).
- The reply says the payment is waiting for the university and that there is no receipt yet; it does not claim a credit.

### Step 4. The evaluator moves virtual time

Not part of the transcript. `POST /api/evaluation/advance-clock` with the evaluator session and `{ "minutes": 1440 }` (24 virtual hours). Moving the clock processes the scheduled events: the simulated university credits the transfer on its ledger at the estimated arrival time and issues a receipt.

### Step 5. The student asks for the status

> "Has the university received my payment?"

- `tools`: none; the model answered from the current `<case_state>`, which the server sends fresh on every turn.
- The reply gives status `CREDITED`, receipt `AU-RC-8555B526`, CNY 20,000.00, reference `AG-STUDENT-01` and the credit time 2026-10-21 09:00 UTC (virtual time).
- The server state read by the script afterwards agrees: `t1.attemptStatus` is `CREDITED` with the same receipt id.

### What to look for in the export of such a workspace

For a T1 run, the timeline contains these events, in this order of `seq` (other events can appear between them): `PLAN_CREATED`, `APPROVAL_REQUESTED`, `APPROVAL_GRANTED`, `ATTEMPT_CREATED`, `HOLD_PLACED`, `PROVIDER_SUBMIT_SENT`, `PROVIDER_ACCEPTED`, `HOLD_CAPTURED`, `DEBIT_CONFIRMED`, `INSTITUTION_PENDING`, `CLOCK_ADVANCED` and `INSTITUTION_CREDITED`. Test N01 checks that `DEBIT_CONFIRMED` and `INSTITUTION_CREDITED` each appear exactly once and that the sequence numbers have no gaps. The `approvals` entry shows the full fingerprint and signed payload; the `attempts` entry shows one attempt with its truncated key.

## 4. Reading a failure

- `fallback` not null in a transcript means the safe exit ran (no model answer). The state is unchanged and the same action is available in the structured controls.
- A `SECURITY_BLOCK` component or event names the official category (`INDUCED_TRANSFER`, `DATA_EXTRACTION`, `PRIVILEGE_ESCALATION` or `PROMPT_INJECTION`) and the reason. The block is in the evidence log; the effect (no attempt, no change) is what the server guarantees.
- An attempt in `UNKNOWN` means the provider's response was lost; the next step is reconciliation of the same attempt (`ATTEMPT_UNKNOWN` with `nextStep: RECONCILE_SAME_ATTEMPT`), never a second payment.
