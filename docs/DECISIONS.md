# Laser Focus decisions and remaining questions

Recorded November 7, 2026. These decisions refine the suggested plan; they do not claim that every feature is implemented.

| Decision | Reason | Revisit when |
| --- | --- | --- |
| Four-person team; uniform dev container targets ARM64 and x86-64 on macOS, Windows and Linux | Liam confirmed team size and shared tooling needs on November 7; see [project memory](PROJECT-CONTEXT.md) | Record validation per host/architecture once implemented; fourth teammate's role remains unassigned here |
| Keep one root application and npm; adapt LevelUp's dev-container amenities only | This repository has no client/server workspace split; the reference's databases, Bun and personal mounts are not requirements | Actual application needs justify additional services or a workspace split |
| Non-VS Code editors (such as VSCodium) drive the same devcontainer through Dev Container CLI 0.90.0; Docker-published `appPort` on host loopback replaces editor port forwarding, and `npm run dev:container` binds all container interfaces for that workflow | VSCodium cannot install the Dev Containers extension, the CLI reads the checked-in configuration directly, and `npm run dev` remains loopback-bound for native safety | Interactive CLI use on a teammate's Debian host, a hosted CI run with the published port, and interactive VS Code forwarding are recorded in [verification records](VERIFICATION.md) |
| Include Challenges 1, 2, 6 and 4 as explicitly requested | One integrated story spans action, accountability and controlled disclosure | Keep scope bounded within each challenge rather than removing requested challenges |
| Implement one application plus a grant-year/category ledger for Challenge 6 | A quarterly report alone cannot meet the brief | Add another funder only after the first slice passes |
| Include one week of counseling notes, exact preview, nonpayable exclusion and access audit | Challenge 4 is in scope; deterministic field filtering makes disclosure inspectable | Broader access roles and additional funders are pilot/expansion work |
| Next.js + TypeScript on Node.js 22+ throughout | User chose the fastest reliable stack; both frontend teammates use Next.js/TypeScript; one language and contract reduce integration work | The product requires independent service scaling |
| OpenAI Agents SDK for bounded evidence reading and drafting | Makes the agent behavior visible while leaving arithmetic and mutations deterministic | New tasks need more tools or orchestration |
| Do not require Pollard, jsonld-ex or epicormic in the first version | The suggested packages are not necessary for this narrowly scoped demo; integration would add a critical dependency | A package proves a needed capability with a working small integration |
| Deterministic merge, totals, queue rules and claim checks | Correctness should not depend on a language model's judgment or arithmetic | Requirements change, not merely because a model can generate the answer |
| Human-reviewed identity merges | Ambiguous identities should remain separate until staff decide | Never silently replace this with automatic model approval |
| Store money in integer cents | Gift sums and merge invariants need exact arithmetic | Multiple currencies are introduced with explicit conversion rules |
| Explicit demo date and historical donor evidence | Queue rules depend on time; one quarter alone cannot establish an annual lapse | A live clock and real ingest workflow replace the fixed scenario |
| Check both data revision and draft revision before approval | Edits and imported records can make an apparently correct draft stale | A transactional snapshot/version model replaces local state |
| Atomic JSON writes in a single process | Simple durable local state makes the demo reproducible | Before multiple server instances, concurrent multi-user deployment or real data; use a transactional database and authentication |
| Recorded execution history, not identical stochastic replay | We can preserve evidence and outputs without claiming model determinism | A defined replay engine is actually implemented |
| Visible live/demo mode | Deterministic fallback keeps a demo runnable without misrepresenting AI use | Keep the distinction in any future fallback |
| Simulated outbox for fictional follow-ups; no real external sending | Demonstrates an end-to-end local flow while making transport boundaries explicit | An authorized delivery integration is implemented and tested |

## Brief coverage and gaps

- **Challenge 1:** the target includes the quarter's records, absence follow-up and sourced report. The minimum also says follow-ups are sent; approved drafts or exports leave that delivery gap open. [Full brief](https://docs.google.com/document/d/1X0nP6pQjB0GKEpDquI6nOIFcrbU0WMCt5h6vTLuA23Q/edit).
- **Challenge 2:** the target covers staff-approved deduplication without lost history and dated regular-gift flags. Demonstrate the seeded cases and rule tests; do not promise every real-world donor cadence is supported. [Full brief](https://docs.google.com/document/d/1sstZADKztRXZdPeCALaYSPCuJstmd2MrjnVQqpFxKgM/edit).
- **Challenge 6:** required target is one made-up grant end to end: bounded application answer, checked facts and category ledger in the funder's year. Do not claim completion until those gates pass. [Full brief](https://docs.google.com/document/d/12vR2Nui-AA3aIWVVH4mqYYtMOMFjZ_wwbNrRwPci3IU/edit).
- **Challenge 4:** required target is one made-up week with notes written once and an exact required-fields-only funder preview, plus nonpayable exclusion and access audit. Authentication remains a pilot requirement; a demo audit is not a complete access-control system. [Full brief](https://docs.google.com/document/d/1-fWxAdZohpqdYANfy1nHPb5X9CZZTZZSitgIl6ipYIQ/edit).

## Verified event facts and unresolved questions

- The event listing gives November 7–8, 2026, noon–9 PM Eastern and names Codex, the OpenAI API and OpenAI Agents SDK as accepted tooling. [Event listing](https://luma.com/codexmiami).
- The project repository must be public with an MIT or Apache 2.0 license by the submission deadline. [Challenge overview](https://docs.google.com/document/d/1dTh6wVOAtDjGyCIVv28Pm94Yfz8Z4kGo8DFhRNDpgsw/edit).
- **Submission cutoff supplied by Liam on November 7:** Sunday, November 8, 2026, **4:45 PM Eastern**. This is separate from the published 9 PM event close.
- **Unresolved:** judging rubric, presentation duration, submission form and how combined challenge entries are judged.
- The suggested plan says an organizer allowed combined challenges. Treat that as the plan's report of a conversation, not an independently verified published rule.

## Pilot boundary

Before using real nonprofit records, replace the single-process store, add authenticated roles and access controls, define retention and delivery behavior, and validate imports with staff. These are production requirements, not additional hackathon modules. The current build should remain visibly fictional.
