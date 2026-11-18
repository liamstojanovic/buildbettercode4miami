"use client";
import { useState, type ReactNode } from "react";
import { browserDemo, demoRequest } from "@/lib/browser-demo";
import { errorMessage } from "@/lib/client-api";
export default function DemoDownload({ href, children, className, onError }: { href: string; children: ReactNode; className?: string; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  return <a href={href} download className={className} aria-disabled={busy} onClick={async event => {
    if (!browserDemo) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const reply = await demoRequest(href, "GET");
      if (reply.status >= 400 || !reply.download) throw new Error((reply.data as { error?: string })?.error || "Export failed.");
      const url = URL.createObjectURL(new Blob([String(reply.data)], { type: reply.download.contentType }));
      const link = document.createElement("a");
      link.href = url; link.download = reply.download.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { onError(errorMessage(error)); }
    finally { setBusy(false); }
  }}>{busy ? "Preparing download…" : children}</a>;
}
