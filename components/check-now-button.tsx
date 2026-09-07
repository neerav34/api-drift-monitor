"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CheckNowButton({ apiId }: { apiId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/apis/${apiId}/check`, { method: "POST" });
    const body = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(body.error ?? "Check failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        {pending ? "Checking..." : "Check Now"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
