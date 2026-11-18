"use client";
import { useEffect, useState } from "react";
import { browserDemo, storageNotice } from "@/lib/browser-demo";
export default function DemoNotice() {
  const [notice, setNotice] = useState("Fictional demo · Changes saved in this browser only.");
  useEffect(() => {
    const update = () => setNotice(storageNotice());
    update(); window.addEventListener("demo-storage-notice", update);
    return () => window.removeEventListener("demo-storage-notice", update);
  }, []);
  return browserDemo ? <div className="notice" role="status">{notice}</div> : null;
}
