# ArrivalGuard pitch outline

Nine slides with very little text: at most 8 words on each slide, plus one visual. Captures are real files in `docs/design/screens/` (taken by `pnpm ui:check`); the speaker notes are for the presenter and do not go on the slide. All data shown is synthetic.

| # | Slide | On the slide (max 8 words) | Visual | Speaker notes |
|---|---|---|---|---|
| 1 | Problem | Tuition abroad: late, lost or paid twice. | `landing-1440-light.png` | A student's family pays tuition across currencies and intermediaries. A payment can arrive late, go to the wrong account, or be sent twice when an answer is lost. |
| 2 | Users | The student asks. The payer decides. | `student-empty-1440-light.png` next to `payer-1440-light.png` | Sofía, the student, prepares and asks. Carlos, her father, holds the savings and the authority: limits, reserve and approvals. |
| 3 | What exists | Pays, tracks to credit, never twice. | `student-credited-1440-light.png` | Live demo with the eight capabilities T1 to T8: pay tuition, check status, arrival transfers, cash projection, route comparison, permissions, refunds and refusals. Simulated provider and university. |
| 4 | Architecture | The model proposes. The server decides. | The Mermaid diagram in `README.md`, rendered; no screen applies | Hexagonal core with a pure domain. A deterministic policy engine picks the route. Claude only calls tools of the session's role; there is no tool to approve. Neon Postgres, Vercel. |
| 5 | Consent | Exact terms, one fingerprint, payer's screen. | `approval-approved-1440-light.png` | The approval binds route, receiver, amounts, limit and reserve by a SHA-256 fingerprint. Any material change needs a new approval. The seal is a visual representation of the fingerprint; security comes from server verification. |
| 6 | Demo | Lost response, same payment, one debit. | `student-waiting-1440-light.png` | The payment is saved before sending. When the provider's answer is lost, the same attempt is reconciled with the same key. Done only when the university credits it. |
| 7 | Security | Four attack types, blocked on the server. | `console-1440-dark.png` | Induced transfer, data extraction, privilege escalation, prompt injection: tests S01 to S16 check effects in the database. The event log shows each security block. |
| 8 | Results | Measured results, with commit and date. | The summary table of `docs/results/RESULTS.md`, figures unchanged; no screen applies | Read the figures exactly as `RESULTS.md` reports them, including failures. Mention the limits of the measurement from `docs/EVALUATION.md`. |
| 9 | Next | Real providers, separate devices, independent audit. | `student-transfer-1440-light.png` | What a real deployment needs: real payment and university integrations, the payer on their own device, KYC and compliance work, and an external security review. |

Word counts on the slide text: 1: 7, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6, 7: 7, 8: 6, 9: 6.
