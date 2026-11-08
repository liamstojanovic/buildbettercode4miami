"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, Link2, LoaderCircle, Plus, Sparkles } from "lucide-react";
import type { Dashboard, Draft, Expense } from "@/lib/types";
import { errorMessage } from "@/lib/client-api";
import { formatMetric } from "@/lib/format";
import styles from "./grants/expense-form.module.css";

const EXPENSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

type ExpenseInput = { id: string; date: string; category: string; amountCents: number; description: string };

type Props = {
  dashboard: Dashboard;
  onGenerateApplication: (grantId: string) => Promise<Draft>;
  onAddExpense: (grantId: string, expense: ExpenseInput) => Promise<{ expense: Expense; inserted: boolean }>;
  onError: (message: string) => void;
  onEvidence: (ids: string[], title: string) => void;
  onDrafted?: (draft: Draft) => void;
};

export function GrantsWorkspace({ dashboard, onGenerateApplication, onAddExpense, onError, onEvidence, onDrafted }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);

  async function generate(grantId: string) {
    setBusy(grantId); onError("");
    try {
      const draft = await onGenerateApplication(grantId);
      onDrafted?.(draft);
    } catch (err) { onError(errorMessage(err)); } finally { setBusy(null); }
  }

  return <div className="workspace-content">
    <div className="grant-intro"><span className="section-icon teal"><CircleDollarSign size={20} /></span><p>Each funder’s calendar, categories, and application rules stay attached to its grant. Every spending figure links back to the ledger.</p></div>
    {dashboard.state.grants.map((grant) => {
      const ledger = dashboard.ledgers.find((item) => item.grantId === grant.id);
      if (!ledger) return null;
      const totalBudget = ledger.categories.reduce((sum, category) => sum + category.budgetCents, 0);
      const totalSpent = ledger.categories.reduce((sum, category) => sum + category.spentCents, 0);
      const upcoming = ledger.upcoming ?? [];
      const latestApplication = [...dashboard.state.drafts].reverse().find((draft) => draft.kind === "application" && draft.grantId === grant.id);
      return <section className="panel grant-card" key={grant.id} aria-labelledby={`grant-${grant.id}`}>
        <div className="panel-heading"><div className="section-title"><span className="section-icon teal"><CircleDollarSign size={21} /></span><div><span className="eyebrow">GRANT</span><h2 id={`grant-${grant.id}`}>{grant.name}</h2></div></div><button className="text-button" onClick={() => onEvidence(grant.sourceIds, `${grant.name} · rules`)}><Link2 size={14} />Funder rules</button></div>
        <div className="grant-calendar"><span><CalendarDays size={15} />Funder year: <strong>{ledger.fiscalStart} — {ledger.fiscalEnd}</strong></span><span>{formatMetric(totalSpent / 100, "USD")} spent of {formatMetric(totalBudget / 100, "USD")} category budgets</span>{ledger.asOf ? <span>Spending counted through <strong>{ledger.asOf}</strong></span> : null}</div>
        <div className="category-grid">{ledger.categories.map((category) => <article className="category-card" key={category.name}><div><h3>{category.name}</h3><span className={`pill ${category.status === "over_budget" ? "pill-coral" : category.status === "near_limit" ? "pill-amber" : "pill-green"}`}>{category.status.replaceAll("_", " ")}</span></div><strong>{formatMetric(category.spentCents / 100, "USD")}<span> / {formatMetric(category.budgetCents / 100, "USD")}</span></strong><div className="budget-bar" role="img" aria-label={`${category.name}: ${formatMetric(category.spentCents / 100, "USD")} spent of ${formatMetric(category.budgetCents / 100, "USD")} budget`}><span className={category.status === "over_budget" ? "over" : category.status === "near_limit" ? "near" : ""} style={{ width: `${Math.min(100, category.budgetCents ? category.spentCents / category.budgetCents * 100 : 100)}%` }} /></div><div className="category-footer"><span>{category.remainingCents >= 0 ? `${formatMetric(category.remainingCents / 100, "USD")} remaining` : `${formatMetric(-category.remainingCents / 100, "USD")} over budget`}</span><button className="text-button" onClick={() => onEvidence(category.sourceIds, `${grant.name} · ${category.name}`)}>Evidence<ArrowRight size={12} /></button></div></article>)}</div>
        <div className={styles.expenseSection}>
          <button className="button button-outline" aria-expanded={openForm === grant.id} aria-controls={`expense-form-${grant.id}`} onClick={() => setOpenForm((current) => current === grant.id ? null : grant.id)}><Plus size={15} />{openForm === grant.id ? "Close expense form" : "Add an expense"}</button>
          {openForm === grant.id ? <ExpenseForm grantId={grant.id} onAddExpense={onAddExpense} onError={onError} /> : null}
        </div>
        <div className="grant-exceptions"><ExpenseList title="Outside approved categories" description="These expenses need review before they can count toward this grant." expenses={ledger.disallowed} onEvidence={onEvidence} /><ExpenseList title="Outside this funder’s year" description="These expenses are excluded from the current funder-year totals." expenses={ledger.outsidePeriod} onEvidence={onEvidence} /><ExpenseList className={styles.upcomingList} title={ledger.asOf ? `Upcoming after ${ledger.asOf}` : "Upcoming"} description="These expenses fall inside the funder year but after the as-of date; they are not yet counted as spending." expenses={upcoming} onEvidence={onEvidence} /></div>
        <div className="application-brief"><div><span className="eyebrow">APPLICATION QUESTION · {grant.wordLimit} WORDS MAXIMUM</span><h3>{grant.applicationQuestion}</h3><p>The draft uses source-backed record metrics. Review its facts and wording before approval.</p></div><div className="application-actions"><button className="button button-primary" disabled={busy !== null} onClick={() => generate(grant.id)}>{busy === grant.id ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}Draft application</button>{latestApplication ? <button className="button button-outline" disabled={busy !== null} onClick={() => onDrafted?.(latestApplication)}>Review application draft</button> : null}</div></div>
      </section>;
    })}
  </div>;
}

function ExpenseList({ title, description, expenses, onEvidence, className }: { title: string; description: string; expenses: Expense[]; onEvidence: Props["onEvidence"]; className?: string }) {
  return <div className={["expense-exception", className].filter(Boolean).join(" ")}><div><AlertCircle size={15} /><h3>{title}</h3><span className="pill pill-neutral">{expenses.length}</span></div><p>{description}</p>{expenses.length ? <ul>{expenses.map((expense) => <li key={expense.id}><button onClick={() => onEvidence(expense.sourceIds, expense.description)}><span><strong>{expense.description}</strong><small>{expense.date} · {expense.category}</small></span><span>{formatMetric(expense.amountCents / 100, "USD")}</span><Link2 size={13} /></button></li>)}</ul> : <small className="muted">No exceptions in this snapshot.</small>}</div>;
}

/** One collapsed-behind-a-toggle entry form per grant card. Keeps the same expense
 *  ID across failures so a retried save can never double-count; a fresh ID is only
 *  generated after a successful submit. */
function ExpenseForm({ grantId, onAddExpense, onError }: { grantId: string; onAddExpense: Props["onAddExpense"]; onError: (message: string) => void }) {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  function resetForm() {
    setId(crypto.randomUUID());
    setDate(""); setCategory(""); setAmount(""); setDescription("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(""); setFormError("");
    if (!EXPENSE_ID_PATTERN.test(id)) { setFormError("The expense ID must be 1–120 letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit."); return; }
    if (!date) { setFormError("Pick the date the expense occurred."); return; }
    const trimmedCategory = category.trim();
    if (!trimmedCategory) { setFormError("Enter the expense category."); return; }
    if (trimmedCategory.length > 100) { setFormError("The category can be at most 100 characters."); return; }
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || !Number.isSafeInteger(cents) || cents <= 0) { setFormError("Enter a positive dollar amount, like 600.00."); return; }
    const trimmedDescription = description.trim();
    if (!trimmedDescription) { setFormError("Describe the expense."); return; }
    if (trimmedDescription.length > 1000) { setFormError("The description can be at most 1,000 characters."); return; }
    setBusy(true);
    try {
      const result = await onAddExpense(grantId, { id, date, category: trimmedCategory, amountCents: cents, description: trimmedDescription });
      setNotice(result.inserted === false ? "Already recorded earlier — no duplicate created." : "Expense recorded.");
      resetForm();
    } catch (err) {
      // Keep every entered value and the same ID so retrying cannot double-count.
      onError(errorMessage(err));
    } finally { setBusy(false); }
  }

  return <form className={styles.expenseForm} id={`expense-form-${grantId}`} onSubmit={submit}>
    <div className={styles.expenseGrid}>
      <label>Expense ID<input value={id} onChange={(event) => setId(event.target.value)} maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,119}" autoComplete="off" required /></label>
      <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={100} placeholder="transport" required /></label>
      <label>Amount (USD)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="600.00" autoComplete="off" required /></label>
      <label className={styles.expenseFull}>Description<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="September transport costs" required /></label>
    </div>
    <p className="field-hint">A new expense needs a new ID; retrying a failed save keeps the same ID so nothing is counted twice. Unknown categories are still recorded and flagged for review as disallowed spending. Demo: $600.00 transport dated 2026-09-30 shows a near-limit warning.</p>
    {formError ? <p className={`notice notice-error ${styles.formNotice}`} role="alert"><AlertCircle size={15} />{formError}</p> : null}
    {notice ? <p className={`notice notice-success ${styles.formNotice}`} role="status"><CheckCircle2 size={15} />{notice}</p> : null}
    <div className={styles.expenseActions}>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}{busy ? "Recording…" : "Record expense"}</button>
      <span className="field-hint">Amounts are converted to integer cents before they are saved.</span>
    </div>
  </form>;
}
