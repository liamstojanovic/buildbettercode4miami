# Laser Focus demo: four challenges in four minutes

This is the target script. Rehearse against the implemented build and remove any statement whose behavior is not verified. All people and records are fictional.

## Before the room

- Start from the README with the intended runtime; verify the application and API are reachable.
- Run reset once, verify the seed date and reporting quarter, and close unrelated tabs.
- Confirm Rosa is pending, the participant and both donors appear in the queue, and the starting gift total is visible.
- Decide the mode in advance. A live run uses the configured OpenAI Agents SDK integration; `demo` uses a labeled deterministic response. Test both before presenting.
- Verify the wrong-claim block, current evidence approval and export. Make sure no previous edit has left the scenario in an unexpected state.
- Check [the backend handoff](BACKEND-HANDOFF.md) before integrating new controls. The backend passed 94 tests, the production build and 74 HTTP checks, including real report/application/follow-up calls. No new browser walkthrough was performed; rehearse each new frontend action after wiring it.
- Keep a short local recording as an optional contingency, labeled as recorded. Do not imply it is a live execution.
- Submit before **Sunday, November 8, 2026, 4:45 PM Eastern**, the cutoff supplied by Liam. Confirm the allowed demo duration with the organizer; the event's 9 PM closing time is separate.

## Script and actions

| Time | Say | Do |
| --- | --- | --- |
| 0:00–0:20 | “One nonprofit, four kinds of repeated work: disconnected records, missed gifts, grant rules and counseling notes copied twice. Laser Focus makes the next action clear and keeps each output tied to its evidence.” | Show fictional-data label, period and sources. |
| 0:20–0:55 | “These three records may be Rosa. Staff see the evidence and decide.” | Approve the candidate. Show fewer unique donors, preserved gift history and unchanged money. |
| 0:55–1:30 | “This participant has missed two completed sessions. We can call before the third. These donors also need follow-up, with evidence attached.” | Open the queue, show reasons and draft/approve a follow-up. If implemented, show a clearly labeled simulated outbox receipt. |
| 1:30–2:10 | “The same records support a report and this funder's application. A wrong figure cannot be approved.” | Show a report metric's evidence. Open application, introduce a wrong claim, save and attempt approval; correct and approve. Show the complete-answer word limit. |
| 2:10–2:40 | “The funder's year starts in July. We count actual spending through this date, separate upcoming costs, and flag budget or category exceptions.” | Show funder dates, as-of date, over-budget/near-limit states and disallowed/outside-year expenses. If the add-expense form is integrated, save a transport expense and show the server-calculated warning change. |
| 2:40–3:25 | “The counselor writes the note once. This private detail stays internal; the funder gets only its required fields.” | Open an audited note, generate the exact funder preview, point to omitted private detail, approve its payload and show the nonpayable-session block. |
| 3:25–4:00 | “We can inspect what the agent read, what it drafted and exactly what staff approved. The result is timely follow-up and less copying, with evidence and disclosure controls.” | Show recorded run/audit events and approved export. Close on the staff outcome. |

Use the actual metric IDs and values present in the build; do not memorize a total that imports or merges may change. Gift amount must not change when identities merge.

## Phrases to keep accurate

- Say **“approved draft”** unless a verified delivery flow exists. Approval and download do not send a message.
- Say **“late monthly gift”** unless a payment-failure row supports **“expired card.”** Missing payments alone do not establish why.
- Say **“recorded execution”** rather than claiming the model reruns identically.
- Claim Challenge 6 coverage only after showing the bounded application and grant-year/category ledger; a sourced quarterly report alone is insufficient.
- Claim Challenge 4 coverage only after showing the week of notes and exact counselor preview. Describe exports and simulated delivery accurately.
- Say **“fictional scenario demonstrates the workflow”**, not an unmeasured claim that the product saved a nonprofit days of work.
- Say **“local single-process demo”** if asked about deployment; production multi-user access, authentication and transactional storage are follow-up work.
- Say **“approval tracks the evidence used for this output.”** Relevant evidence changes require review again; unrelated edits need not invalidate it. An unchanged note save is a no-op.
- Say **“required-field filtering plus a narrow copied-text check.”** The check blocks a complete private detail pasted into a shared field; it is not a detector for every sensitive sentence or paraphrase.

## Likely judge questions

**What makes it an agent?** A bounded run can read allowed evidence and draft the next action or report. The UI exposes its recorded steps and output. Domain logic computes the facts, and a human approves consequential changes.

**What if the model invents a number?** Numeric claims reference typed server metrics and are validated against the current record; invalid claims cannot be approved. Describe the actual validation boundaries for narrative text instead of claiming universal hallucination detection.

**What if two records have the same name?** Name similarity can propose review; it cannot approve a merge. Show matching evidence and the keep-separate path.

**Can this use real nonprofit data tomorrow?** This prototype uses fictional records. A pilot requires authentication, role-based access, transactional persistence and agreement on import/delivery workflows.

**How much time does it save?** The challenge describes the baseline burden. We have demonstrated the workflow, not measured real-world time savings; a pilot would compare completion time and error rates.

## Rehearsal gate

Run the complete flow twice from reset, then once after restarting the server. A second presenter should be able to follow this script without terminal data edits. Prefer fixing the first confusing or failing moment over adding another feature.

Exercise the failure paths before presenting: retry the same expense ID without double-counting; keep a future expense out of spent totals; preserve an approval after an unchanged note save; invalidate it after changing that note; block a complete private detail pasted into progress; and retry an exact disclosure approval without duplicate events. These backend cases have automated coverage. Rehearse the corresponding UI actions once teammates integrate them.
