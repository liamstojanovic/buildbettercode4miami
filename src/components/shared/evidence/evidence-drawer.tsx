"use client";

import { useEffect, useRef } from "react";
import { FileText, X } from "lucide-react";
import type { SourceRow } from "@/lib/types";

export default function EvidenceDrawer({ title, sources, onClose }: {
  title: string; sources: SourceRow[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const rows = sources;
  return <dialog ref={ref} className="evidence-drawer" aria-labelledby="evidence-title" onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="drawer-heading">
      <div><span className="eyebrow">THE RECORD BEHIND THE RESULT</span><h2 id="evidence-title">{title}</h2></div>
      <button className="icon-button" aria-label="Close evidence" onClick={onClose}><X size={20} /></button>
    </div>
    <p className="muted">{rows.length} source {rows.length === 1 ? "row" : "rows"}. Original values stay available after review.</p>
    <div className="evidence-rows">{rows.map((source) => <article className="evidence-row" key={source.id}>
      <div className="source-title"><FileText size={16} /><strong>{source.source}</strong><span>Row {source.row}</span></div>
      <dl>{Object.entries(source.values).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl>
      <code>{source.id}</code>
    </article>)}</div>
    {rows.length === 0 ? <p className="empty-state">No contributing source rows for this item.</p> : null}
  </dialog>;
}
