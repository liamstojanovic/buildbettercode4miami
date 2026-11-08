"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Centered native-dialog modal. Escape, the close button, and a click on the
// backdrop all dismiss it; the caller owns what "closed" means for its state.
export default function Modal({ title, pulse, onClose, children }: { title: string; pulse?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={`modal-shell${pulse ? " modal-pulse" : ""}`} aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-topbar"><button className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={19} /></button></div>
    {children}
  </dialog>;
}
