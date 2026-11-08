"use client";

import { useEffect } from "react";
import { Check, X } from "lucide-react";

// Floating success notice: slides in from the top, fades out, dismissible.
// Timed to match the CSS animation (toast-out finishes at 6.5s).
export default function ToastNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return <div className="notice notice-success notice-toast" role="status"><Check size={17} />{message}<button className="icon-button" aria-label="Dismiss notification" onClick={onDismiss}><X size={15} /></button></div>;
}
