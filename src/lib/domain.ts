import type { Attendance, Claim, DemoState, Donor, Draft, MergeCandidate, Metric, QueueItem, ValidationIssue } from "./types";
import { currentGivingCycle } from "./records-schedule";

const unique = (items: string[]) => [...new Set(items)];
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const inQuarter = (state: DemoState, date: string) => date >= state.period.start && date <= state.period.end && date <= state.asOf;

export function canonicalDonorId(state: DemoState, id: string): string {
  const seen = new Set<string>();
  let donor = state.donors.find((row) => row.id === id);
  if (!donor) throw new Error(`Unknown donor: ${id}`);
  while (donor.mergedInto) {
    if (seen.has(donor.id)) throw new Error("Invalid circular donor merge");
    seen.add(donor.id);
    donor = state.donors.find((row) => row.id === donor!.mergedInto);
    if (!donor) throw new Error("Invalid merge target");
  }
  return donor.id;
}

function contactMatches(a: Donor, b: Donor): string[] {
  const reasons: string[] = [];
  const emails = a.emails.map(normalizeEmail).filter(Boolean);
  if (b.emails.some((email) => emails.includes(normalizeEmail(email)))) reasons.push("Shared email address");
  const phone = normalizePhone(a.phone);
  if (phone.length >= 10 && phone === normalizePhone(b.phone)) reasons.push("Shared phone number");
  return reasons;
}

function rejectedGroups(state: DemoState): string[][] {
  return state.candidates.filter((candidate) => candidate.status === "rejected")
    .map((candidate) => unique(candidate.donorIds.map((id) => canonicalDonorId(state, id))));
}

function respectsSeparation(donorIds: string[], rejected: string[][]): boolean {
  return rejected.every((group) => donorIds.filter((id) => group.includes(id)).length < 2);
}

/** Contact overlap proposes review. Staff separation decisions also constrain new imports. */
export function detectMergeCandidates(state: DemoState): MergeCandidate[] {
  const active = state.donors.filter((donor) => !donor.mergedInto);
  const aliases = new Map(active.map((donor) => [donor.id, [] as Donor[]]));
  for (const donor of state.donors) aliases.get(canonicalDonorId(state, donor.id))!.push(donor);
  const rejected = rejectedGroups(state);
  const groups = active.map((donor) => ({ donors: [donor], reasons: [] as string[] }));
  const groupByDonor = new Map(groups.map((group) => [group.donors[0].id, group]));
  for (let left = 0; left < active.length; left++) for (let right = left + 1; right < active.length; right++) {
    const reasons = unique(aliases.get(active[left].id)!.flatMap((a) => aliases.get(active[right].id)!.flatMap((b) => contactMatches(a, b))));
    if (!reasons.length) continue;
    const first = groupByDonor.get(active[left].id)!;
    const second = groupByDonor.get(active[right].id)!;
    if (first === second) { first.reasons.push(...reasons); continue; }
    if (!respectsSeparation([...first.donors, ...second.donors].map((donor) => donor.id), rejected)) continue;
    first.donors.push(...second.donors);
    first.reasons.push(...second.reasons, ...reasons);
    for (const donor of second.donors) groupByDonor.set(donor.id, first);
    groups.splice(groups.indexOf(second), 1);
  }
  const candidates: MergeCandidate[] = [];
  for (const { donors, reasons } of groups) {
    if (donors.length < 2) continue;
    const donorIds = donors.map((donor) => donor.id).sort();
    const id = `merge:${donorIds.join("+")}`;
    candidates.push({ id, donorIds, name: donors[0].name, reasons: unique(reasons), status: "pending", sourceIds: unique(donors.flatMap((donor) => aliases.get(donor.id)!.flatMap((alias) => alias.sourceIds))) });
  }
  return [...state.candidates.filter((candidate) => candidate.status !== "pending"), ...candidates];
}

export function getMetrics(state: DemoState): Metric[] {
  const gifts = state.gifts.filter((gift) => inQuarter(state, gift.date));
  const donorIds = unique(gifts.map((gift) => canonicalDonorId(state, gift.donorId)));
  const attended = state.attendance.filter((item) => inQuarter(state, item.date) && item.status === "present");
  const hours = state.volunteerHours.filter((item) => inQuarter(state, item.date));
  return [
    { id: "participants", label: "Enrolled participants", value: state.participants.length, unit: "people", sourceIds: unique(state.participants.flatMap((item) => item.sourceIds)) },
    { id: "donors", label: "Unique donors this quarter", value: donorIds.length, unit: "people", sourceIds: unique(gifts.flatMap((gift) => [...gift.sourceIds, ...state.donors.find((donor) => donor.id === gift.donorId)!.sourceIds])) },
    { id: "giving", label: "Quarter giving", value: gifts.reduce((sum, gift) => sum + gift.amountCents, 0) / 100, unit: "USD", sourceIds: unique(gifts.flatMap((gift) => gift.sourceIds)) },
    { id: "attendance", label: "Attended sessions", value: attended.length, unit: "sessions", sourceIds: unique(attended.flatMap((item) => item.sourceIds)) },
    { id: "volunteer_hours", label: "Volunteer hours", value: hours.reduce((sum, item) => sum + item.hours, 0), unit: "hours", sourceIds: unique(hours.flatMap((item) => item.sourceIds)) },
  ];
}

export function getQueue(state: DemoState): QueueItem[] {
  const queue: QueueItem[] = [];
  const status = (id: string) => state.drafts.some((draft) => draft.queueItemId === id && draft.status === "approved" && draft.dataRevision === state.revision) ? "approved" as const : "open" as const;
  for (const person of state.participants) {
    const completed = state.attendance.filter((item) => item.participantId === person.id && item.date <= state.asOf && (item.status === "present" || item.status === "absent")).sort((a, b) => b.date.localeCompare(a.date));
    const consecutive = [];
    for (const item of completed) { if (item.status !== "absent") break; consecutive.push(item); }
    if (consecutive.length < 2) continue;
    const id = `attendance:${person.id}`;
    queue.push({ id, entityId: person.id, name: person.name, kind: "attendance", priority: "high", reason: `${consecutive.length} consecutive completed sessions missed (${consecutive.at(-1)!.date} to ${consecutive[0].date}). Cancelled and future sessions excluded.`, suggestedAction: `Check in with ${person.guardian} and ask what support would help.`, sourceIds: unique([...person.sourceIds, ...consecutive.flatMap((item) => item.sourceIds)]), status: status(id) });
  }
  for (const donor of state.donors.filter((item) => !item.mergedInto && item.cadence && item.expectedAt && item.expectedAt <= state.asOf)) {
    const cycle = currentGivingCycle(donor, state.asOf);
    if (!cycle) continue;
    const gifts = state.gifts.filter((gift) => canonicalDonorId(state, gift.donorId) === donor.id && gift.date <= state.asOf);
    if (gifts.some((gift) => gift.date >= cycle.start && gift.date < cycle.end)) continue;
    const failure = state.paymentFailures.filter((item) => canonicalDonorId(state, item.donorId) === donor.id && item.date >= cycle.start && item.date < cycle.end && item.date <= state.asOf).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    const id = `${donor.cadence}:${donor.id}`;
    const history = gifts.sort((a, b) => b.date.localeCompare(a.date));
    if (!history.length) continue;
    const timing = donor.cadence === "annual" && cycle.decemberGrace
      ? `${state.asOf > cycle.due ? "Historical lapse: expected" : "Annual lapse: expected"} December ${cycle.start.slice(0, 4)} gift is missing; grace date ${cycle.due}. Last gift ${history[0].date}.${state.asOf > cycle.due ? " This is a retrospective catch, not a timely alert." : ""}`
      : `${donor.cadence === "annual" ? "Annual" : "Monthly"} gift due ${cycle.due} is missing.`;
    const reason = `${timing} ${failure ? `Payment failed ${failure.date}: ${failure.reason.replaceAll("_", " ")}.` : "Cause unknown; no payment-failure record."}`;
    queue.push({ id, entityId: donor.id, name: donor.name, kind: donor.cadence!, priority: failure ? "high" : "medium", reason, suggestedAction: failure ? "Offer help updating payment details through the existing secure donation page." : "Make a considerate check-in; do not assume the reason for the missed gift.", sourceIds: unique([...donor.sourceIds, ...history.flatMap((gift) => gift.sourceIds), ...(failure?.sourceIds ?? [])]), status: status(id) });
  }
  return queue;
}

export function decideMerge(state: DemoState, candidateId: string, decision: "approve" | "reject"): void {
  const candidate = state.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Merge candidate not found");
  if (candidate.status !== "pending") throw new Error("This merge has already been reviewed");
  if (decision !== "approve" && decision !== "reject") throw new Error("Invalid merge decision");
  const donors = candidate.donorIds.map((id) => state.donors.find((donor) => donor.id === id));
  if (donors.some((donor) => !donor || donor.mergedInto)) throw new Error("Candidate is stale; review refreshed records");
  if (decision === "approve") {
    if (!respectsSeparation(candidate.donorIds, rejectedGroups(state))) throw new Error("This merge conflicts with a prior keep-separate decision");
    // A descriptive display name is preferred over initials; original records remain intact.
    const sorted = (donors as Donor[]).sort((a, b) => b.name.length - a.name.length || a.id.localeCompare(b.id));
    const target = sorted[0];
    const schedules = sorted.filter((donor) => donor.cadence);
    if (schedules.some((donor) => donor.cadence !== schedules[0].cadence || donor.expectedAt !== schedules[0].expectedAt)) throw new Error("Conflicting giving schedules need manual review");
    target.emails = unique(sorted.flatMap((donor) => donor.emails));
    target.sourceIds = unique(sorted.flatMap((donor) => donor.sourceIds));
    if (schedules[0]) { target.cadence = schedules[0].cadence; target.expectedAt = schedules[0].expectedAt; }
    for (const donor of sorted.slice(1)) donor.mergedInto = target.id;
    candidate.status = "approved";
    state.revision++;
  } else candidate.status = "rejected";
  state.audit.push({ id: `audit-${state.audit.length + 1}`, at: new Date().toISOString(), action: `merge.${decision === "approve" ? "approved" : "rejected"}`, detail: `${candidate.name}: ${candidate.donorIds.length} records reviewed. Original identities and gift records preserved.`, sourceIds: candidate.sourceIds });
}

// Numbers belong in bound claim fields, not unstructured prose. This is deliberately
// conservative and is not a general semantic truth checker for arbitrary statements.
const numericalProse = /[\p{N}$%€£]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent|percentage|half|double|triple)\b/iu;

export function validateDraft(state: DemoState, draft: Draft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const metrics = getMetrics(state);
  const sources = new Set(state.sources.map((source) => source.id));
  if (draft.dataRevision !== state.revision) issues.push({ code: "stale", message: "Records changed after this draft was created. Generate a fresh draft before approval." });
  if (!draft.narrative.trim()) issues.push({ code: "empty", message: "Draft text is required." });
  if (numericalProse.test(draft.narrative) || numericalProse.test(draft.title)) issues.push({ code: "unbound_number", message: "Keep numerical claims in the verified figure fields. Remove numbers or number words from the title and narrative." });
  if (draft.narrative.trim().split(/\s+/).length > 250) issues.push({ code: "word_limit", message: "Narrative exceeds the 250-word review limit." });
  if (!draft.sourceIds.length || draft.sourceIds.some((id) => !sources.has(id))) issues.push({ code: "source", message: "Every draft needs valid source references." });
  const seen = new Set<string>();
  for (const claim of draft.claims) {
    const metric = metrics.find((item) => item.id === claim.metricId);
    if (seen.has(claim.metricId)) issues.push({ code: "duplicate_claim", message: "A figure may be included only once.", metricId: claim.metricId });
    seen.add(claim.metricId);
    if (!metric || !Number.isFinite(claim.value) || metric.value !== claim.value) issues.push({ code: "claim_mismatch", message: metric ? `${metric.label} must be ${metric.value} ${metric.unit}, as calculated from the records.` : "Unknown metric; it cannot be verified.", metricId: claim.metricId });
    if (metric && metric.sourceIds.some((id) => !draft.sourceIds.includes(id))) issues.push({ code: "missing_evidence", message: `Evidence is incomplete for ${metric.label}.`, metricId: claim.metricId });
  }
  if (draft.kind === "report" || draft.kind === "application") {
    for (const metric of metrics) if (!seen.has(metric.id)) issues.push({ code: "missing_claim", message: `Include the required figure: ${metric.label}.`, metricId: metric.id });
  } else {
    if (draft.claims.length) issues.push({ code: "followup_claims", message: "Follow-ups must not include reporting figures." });
    const item = getQueue(state).find((entry) => entry.id === draft.queueItemId);
    if (!item) issues.push({ code: "queue", message: "This follow-up no longer has an active evidence-backed task." });
    else if (item.sourceIds.some((id) => !draft.sourceIds.includes(id))) issues.push({ code: "missing_evidence", message: "Include the task's complete evidence before review." });
  }
  return issues;
}

export function renderDraft(state: DemoState, draft: Draft): string {
  const metrics = getMetrics(state);
  const format = ({ metricId, value }: Claim) => {
    const metric = metrics.find((item) => item.id === metricId);
    const amount = metric?.unit === "USD" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value) : `${value} ${metric?.unit ?? ""}`;
    return `${metric?.label ?? metricId}: ${amount}`;
  };
  return [draft.title, `Fictional demonstration data | ${state.period.label} | As of ${state.asOf}`, `Status: ${draft.status} | Draft revision: ${draft.revision} | Record revision: ${draft.dataRevision}`, "", draft.narrative, "", ...draft.claims.map(format), "", "Source references:", ...draft.sourceIds.map((id) => {
    const source = state.sources.find((item) => item.id === id);
    return source ? `${id} — ${source.source}, row ${source.row}` : `${id} — unavailable`;
  }), "", "Approval records staff review; this application does not send messages or submit reports."].join("\n");
}

/** Staff capture is an upsert by participant and date; prior source rows remain inspectable. */
export function recordAttendance(state: DemoState, input: { participantId: string; date: string; status: Attendance["status"] }): Attendance {
  if (!state.participants.some((person) => person.id === input.participantId)) throw new Error("Participant not found");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw new Error("Attendance needs a valid ISO date");
  if (!["present", "absent", "cancelled", "scheduled"].includes(input.status)) throw new Error("Invalid attendance status");
  const existing = state.attendance.find((item) => item.participantId === input.participantId && item.date === input.date);
  if (existing?.status === input.status) return existing;
  const previousStatus = existing?.status;
  const id = existing?.id ?? `attendance-${input.participantId}-${input.date}`;
  const sourceId = `src-staff-${id}-revision-${state.revision + 1}`;
  const at = new Date().toISOString();
  state.sources.push({ id: sourceId, source: "staff-attendance", row: state.sources.filter((source) => source.source === "staff-attendance").length + 2,
    values: { participant_id: input.participantId, date: input.date, status: input.status }, importedAt: at });
  const attendance = existing ?? { id, participantId: input.participantId, date: input.date, status: input.status, sourceIds: [] };
  attendance.status = input.status;
  attendance.sourceIds = [sourceId];
  if (!existing) state.attendance.push(attendance);
  state.revision++;
  state.audit.push({ id: `audit-${state.audit.length + 1}`, at, action: "attendance.recorded", detail: `${input.participantId} on ${input.date}: ${previousStatus ?? "not recorded"} → ${input.status}.`, sourceIds: [sourceId] });
  return attendance;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const input = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("Malformed quoted CSV cell");
      quoted = true;
    } else if (char === ",") { row.push(cell); cell = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ""; closed = false;
    } else { if (closed && char.trim()) throw new Error("Unexpected text after quoted CSV field"); if (!closed) cell += char; }
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

/** Normalized, bounded CSV import. Every row is checked before any mutation. */
export function importGiftCsv(state: DemoState, csv: string, sourceName: string): { inserted: number; skipped: number } {
  if (csv.length > 500_000) throw new Error("CSV exceeds the 500 KB demo limit");
  const rows = parseCsv(csv);
  if (rows.length < 2 || rows.length > 1001) throw new Error("CSV must contain a header and between 1 and 1,000 data rows");
  const required = ["gift_id", "donor_id", "name", "email", "phone", "amount_cents", "date", "channel"];
  const header = rows[0].map((item) => item.trim());
  if (header.length !== required.length || required.some((key) => !header.includes(key)) || new Set(header).size !== header.length) throw new Error(`CSV header must contain exactly: ${required.join(",")}`);
  const working = structuredClone(state);
  let inserted = 0, skipped = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.length !== header.length) throw new Error(`Row ${index + 1}: incorrect number of fields`);
    const values = Object.fromEntries(header.map((key, column) => [key, row[column].trim()]));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(values.gift_id) || !/^[A-Za-z0-9_-]{1,100}$/.test(values.donor_id)) throw new Error(`Row ${index + 1}: invalid gift or donor ID`);
    if (!values.name || values.name.length > 150) throw new Error(`Row ${index + 1}: donor name is required`);
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error(`Row ${index + 1}: invalid email`);
    if (!/^\d+$/.test(values.amount_cents) || !Number.isSafeInteger(Number(values.amount_cents)) || Number(values.amount_cents) <= 0) throw new Error(`Row ${index + 1}: amount_cents must be a positive safe integer`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || Number.isNaN(Date.parse(values.date)) || new Date(values.date).toISOString().slice(0, 10) !== values.date) throw new Error(`Row ${index + 1}: invalid ISO date`);
    if (!["online", "tickets", "auction", "check"].includes(values.channel)) throw new Error(`Row ${index + 1}: unsupported gift channel`);
    const existing = working.gifts.find((gift) => gift.id === values.gift_id);
    if (existing) {
      if (existing.donorId !== values.donor_id || existing.amountCents !== Number(values.amount_cents) || existing.date !== values.date || existing.channel !== values.channel) throw new Error(`Row ${index + 1}: gift ID conflicts with an existing transaction`);
      const original = working.sources.find((source) => existing.sourceIds.includes(source.id) && typeof source.values.name === "string" && typeof source.values.email === "string" && typeof source.values.phone === "string");
      const identity = working.donors.find((donor) => donor.id === existing.donorId)!;
      // Imported transactions have a complete immutable identity snapshot. Older
      // gift-only sources may replay only metadata already supported by that donor.
      const metadataMatches = original
        ? original.values.name === values.name && normalizeEmail(String(original.values.email)) === normalizeEmail(values.email) && normalizePhone(String(original.values.phone)) === normalizePhone(values.phone)
        : identity.name === values.name && (!values.email || identity.emails.some((email) => normalizeEmail(email) === normalizeEmail(values.email))) && (!values.phone || normalizePhone(identity.phone) === normalizePhone(values.phone));
      if (!metadataMatches) throw new Error(`Row ${index + 1}: gift ID conflicts with existing identity metadata`);
      skipped++; continue;
    }
    let donor = working.donors.find((item) => item.id === values.donor_id);
    if (donor) {
      const matchingContact = contactMatches(donor, { id: values.donor_id, name: values.name, emails: values.email ? [values.email] : [], phone: values.phone, sourceIds: [] }).length > 0;
      const bothHaveContacts = (donor.emails.length > 0 || Boolean(donor.phone)) && Boolean(values.email || values.phone);
      if (!matchingContact && (donor.name !== values.name || bothHaveContacts)) throw new Error(`Row ${index + 1}: donor ID conflicts with an existing identity`);
    }
    const sourceId = `src-import-${values.gift_id}`;
    if (working.sources.some((source) => source.id === sourceId)) throw new Error(`Row ${index + 1}: source ID conflict`);
    working.sources.push({ id: sourceId, source: sourceName.replace(/[\r\n]/g, " ").slice(0, 120) || "uploaded.csv", row: index + 1, values: { ...values, amount_cents: Number(values.amount_cents) }, importedAt: new Date().toISOString() });
    if (!donor) { donor = { id: values.donor_id, name: values.name, emails: values.email ? [normalizeEmail(values.email)] : [], phone: values.phone, sourceIds: [sourceId] }; working.donors.push(donor); }
    else { donor.sourceIds = unique([...donor.sourceIds, sourceId]); donor.emails = unique([...donor.emails, ...(values.email ? [normalizeEmail(values.email)] : [])]); }
    working.gifts.push({ id: values.gift_id, donorId: values.donor_id, amountCents: Number(values.amount_cents), date: values.date, channel: values.channel as "online" | "tickets" | "auction" | "check", sourceIds: [sourceId] });
    inserted++;
  }
  if (inserted) {
    const total = working.gifts.reduce((sum, gift) => sum + gift.amountCents, 0);
    if (!Number.isSafeInteger(total)) throw new Error("Combined gift amount exceeds supported precision");
    working.revision++;
    working.candidates = detectMergeCandidates(working);
    working.audit.push({ id: `audit-${working.audit.length + 1}`, at: new Date().toISOString(), action: "import.completed", detail: `${inserted} gift records imported; ${skipped} existing transactions skipped.`, sourceIds: working.sources.slice(state.sources.length).map((source) => source.id) });
    Object.assign(state, working);
  }
  return { inserted, skipped };
}
