# DevDay Exchange 2026 - Laser Focus Combined Build Plan

Event: DevDay Exchange (DeepStation / Codex Miami, "Agents for Good"), The LAB Miami.
Window: Sat Nov 7 - Sun Nov 8, 2026, event closes 9:00 PM ET Sun. Submission needs a public GitHub repo, MIT or Apache 2.0 license, by the submission deadline.
Scope (decided Nov 7): Challenges 1 + 2 (core) + 6 (reporting layer) + 4 (disclosure module). Organizer confirmed flexible on combining challenges.
Full challenge texts: see challenges.md in this folder.

## The pitch in one line

One canonical record for the whole nonprofit, where every figure carries its provenance, and every agent action (a merge, a drafted note, a funder copy, a report) runs under a budget, waits for human approval, and can be replayed exactly. Type each thing once; the numbers agree because there is only one place they can come from.

## What each brief must show at demo time

- Challenge 1 (Marisol, ops): one record of sign-ups, attendance, matches, and hours for one quarter; the "who needs a call this week" queue catches the kid with consecutive absences before week three; the quarterly report is generated from the record, not assembled by hand.
- Challenge 2 (Denise, donors): four gift channels (online, event tickets, gala auction, checks) ingested into the same record; the Rosa Delgado triple ("Rosa Delgado" / "Rosa M. Delgado" / "R. Delgado") proposed as a merge and merged only after staff approval, with full gift history preserved; the lapsed December-annual donor and the monthly donor whose card expired are both flagged while a call can still fix it.
- Challenge 6 (Claudette, grants): an application draft and a funder report in the org's voice where every number traces to a record entry; a draft claim that does not match the record is caught by the claim check before approval; spending shown against each funder's own restrictions.
- Challenge 4 (Reginald, counseling notes): a session note written once; the funder version contains only the fields that funder requires, with the planted private detail excluded; the counselor previews exactly what will be sent before it goes; a session the funder does not pay for never enters the funder copy; every note access is logged.

## Architecture

Stack: the project lead's own published packages, used where they are real.

- Canonical record: a JSON-LD graph (jsonld-ex) of kids, families, mentors, volunteers, donors, gifts, workshops, grants, and notes. Every figure carries veracity/provenance annotations: where it came from, when, and from which source list.
- Agent runtime: Pollard. All drafting and disclosure actions are governed executions with a budget, an approval gate before anything is sent, merged, or filed, and exact replay as the audit trail.
- Draft checking: epicormic-style drift checks applied to generated text. Any figure in a draft that drifts from the record blocks approval until fixed.
- Identity resolution: name-variant and contact matching across source lists produces merge CANDIDATES for the approval queue. Nothing auto-merges.

Modules (scaffold in laser-focus/src/):

1. ingest.py - load the four ops lists and four donor channels.
2. resolve.py - duplicate candidate detection, approval queue.
3. record.py - build and query the canonical JSON-LD record.
4. queues.py - absence queue (kids) and lapse queue (donors), one combined call list.
5. report.py - quarterly report and per-funder reports, generated from the record only.
6. draft_check.py - draft claims checked against record figures before approval.
7. disclose.py - per-funder field filter for counseling notes, counselor preview payload, access log, non-payable session exclusion.

## Data (all synthetic, seeded generator in laser-focus/data/generate.py)

- One quarter (13 weeks) of sign-ups, attendance, matches, and volunteer hours, with the same people under spelling variants across files, and one kid with 3 consecutive absences.
- Donor gifts across the four channels, including the Rosa Delgado triple with two emails, one December-annual donor who skipped last year, and one monthly donor whose gifts stop mid-quarter.
- Two funders in funders.json with distinct rules: required report fields, spending restrictions, and (for the counseling funder) a strict note-field schema that is a subset of the full note.
- One week of counseling notes (5 days, about 5 families a day) in the full internal schema, with at least one planted private detail the funder does not require and at least one session marked not funder-payable.

## Build order

1. Record and resolution layer (ingest, resolve, record). Everything else consumes this. Demo checkpoint: the approval queue shows the Rosa triple and the cross-list mother variants.
2. Queues (absence + lapse, one call list). Demo checkpoint: the 3-absence kid and both lapsed donors appear, with reasons.
3. Reporting and drafting (report, draft_check). Demo checkpoint: quarterly report generated; an application draft with one planted wrong figure is blocked by the claim check, corrected, and approved.
4. Disclosure (disclose). Demo checkpoint: one note, three views - full internal note, funder copy with the private detail absent, counselor preview - plus the access log and the excluded non-payable session.

## Demo script (one story, about 5 minutes)

1. Show the four messy source lists side by side; run ingest; open the approval queue and approve the Rosa Delgado merge. Totals now count her once.
2. Open the call list: the kid with 3 absences and the two lapsed donors, each with the reason and the record entries behind it. Approve a drafted follow-up note; show the replay log of the drafting run.
3. Generate the quarterly report live. Open one funder's application draft; show the claim check catching a wrong number; fix, approve.
4. Open one counseling note; generate the funder copy; show the field diff (private detail present in the note, absent in the copy); show the counselor preview screen and the access log entry.

## Submission checklist

- [ ] Public GitHub repo, MIT license file included (scaffold already has it locally).
- [ ] README with the pitch, architecture, and how to run the demo.
- [ ] All data visibly fictional; no real personal data anywhere.
- [ ] Demo runs end to end from a clean checkout.
- [ ] Submission form completed before the deadline Sun Nov 8.

## Cut order if time runs short

Protect, in this order: (1) record + dedup approval queue, (2) the two queues, (3) one generated report with claim check, (4) one disclosure preview. Cut first: the second funder, then access-log depth, then application drafting (keep the funder report). Challenge 3 (workshops) stays out unless all four in-scope pieces are demo-solid before Sunday noon.

## Deliberately out of scope

Challenge 3 (workshop intake), Challenge 5 (volunteer chats), the Mangrove Mews bonus, and hashrope (no honest fit in this build).
