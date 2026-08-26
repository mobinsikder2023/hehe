"use client";
import { useState } from "react";

export default function ShareActions({
  caption,
  posterUrl,
}: {
  caption: string;
  posterUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  async function download() {
    try {
      const r = await fetch(posterUrl, { cache: "no-store" });
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = "sciencebee-poster.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
    } catch {
      window.open(posterUrl, "_blank");
    }
  }

  return (
    <div className="shareactions">
      <button className="btn yellow" onClick={copyCaption}>
        {copied ? "Caption copied ✓" : "Copy caption"}
      </button>
      <button className="btn" onClick={download}>
        ⬇ Download poster
      </button>
    </div>
  );
}
