"use client";

import { useState } from "react";

export function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 pr-16 text-xs text-neutral-100 dark:bg-black">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 rounded bg-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-600"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
