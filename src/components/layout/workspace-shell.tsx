"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CircleDollarSign, ClipboardCheck, HeartHandshake, LayoutDashboard, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Waves } from "lucide-react";
import { errorMessage } from "@/lib/client-api";
import styles from "./workspace-shell.module.css";

const routes = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: HeartHandshake },
  { href: "/grants", label: "Grants & reports", icon: CircleDollarSign },
  { href: "/counseling", label: "Counseling", icon: LockKeyhole },
];

export type WorkspaceShellProps = {
  title: string;
  description: string;
  period?: string;
  asOf?: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  mode: "demo" | "live";
  liveAvailable: boolean;
  onModeChange: (mode: "demo" | "live") => void;
  onReset: () => void;
  resetting: boolean;
  children?: ReactNode;
};

export default function WorkspaceShell({ title, description, period, asOf, loading, error, onRetry, mode, liveAvailable, onModeChange, onReset, resetting, children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const active = routes.find((route) => route.href === pathname);
  const [resetError, setResetError] = useState("");
  const banner = error || resetError;
  return <div className="app-shell">
    <a href="#main-content" className={styles.skipLink}>Skip to content</a>
    <aside className={`sidebar ${styles.sidebar}`}>
      <Link className="brand" href="/" aria-label="Tidepath home"><span className="brand-mark"><Waves size={28} strokeWidth={1.8} /></span><span>Tidepath<span className="brand-sub">FAMILY ALLIANCE</span></span></Link>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Workspace">{routes.map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} className={`nav-item ${pathname === href ? "active" : ""} ${styles.navLink}`} aria-label={label} aria-current={pathname === href ? "page" : undefined}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-note"><ShieldCheck size={22} /><strong>Good work deserves<br />a clear record.</strong><p>Every number has a source.<br />Every action has a reviewer.</p></div>
      <div className="sidebar-footer"><span className="avatar">TF</span><div><strong>Tidepath demo team</strong><small>Miami-Dade, Florida</small></div><ArrowUpRight size={15} /></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="topbar-crumb">Workspace <span>/</span>{active?.label}</span><span className="demo-badge"><span />SYNTHETIC DEMO</span></header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><span className="eyebrow">LESS ADMIN. MORE HUMAN.</span><h1>{title}</h1><p>{description}</p></div></div>
        <div className="context-bar"><div><ClipboardCheck size={16} /><strong>{period ?? (loading ? "Loading quarter" : "Quarter unavailable")}</strong><span className="context-detail">{asOf ? `Record as of ${asOf.slice(0, 10)}` : "One shared record"}</span></div><span>Fictional demo data</span><div className={styles.contextActions}><label className="mode-select">Drafting mode<select value={mode} onChange={(event) => onModeChange(event.target.value as "demo" | "live")}><option value="demo">Demo · no model call</option><option value="live" disabled={!liveAvailable}>Live · OpenAI agent{liveAvailable ? "" : " (key needed)"}</option></select></label><button className="button button-quiet reset-button" disabled={resetting || loading} onClick={() => { setResetError(""); Promise.resolve(onReset()).catch((err: unknown) => setResetError(errorMessage(err))); }}><RotateCcw size={15} className={resetting ? "spin" : ""} />Reset demo</button></div></div>
        {loading ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={26} /><h2>Bringing your records together</h2><p>Loading the synthetic quarter.</p></div> : null}
        {banner ? <div className="notice notice-error" role="alert"><div><h2>{period ? "That action did not complete." : "The workspace could not load."}</h2><p>{banner}</p><button className="button button-primary" onClick={() => { setResetError(""); onRetry(); }}>Try again</button></div></div> : null}
        {children}
        <footer className="main-footer"><span>Built for the people who show up for their community.</span><span>Fictional people and gifts · No external messages sent</span></footer>
      </main>
    </div>
  </div>;
}
