"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The noise-filter button: clicking it writes to drift_ignores, and
 * future diffs for that endpoint silently drop the field before status is
 * computed (lib/drift/diff.ts's filterDrift, applied server-side in
 * lib/checks/process-check-result.ts). */
export function IgnoreFieldButton({
  endpointId,
  fieldPath,
}: {
  endpointId: string;
  fieldPath: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await fetch(`/api/endpoints/${endpointId}/ignore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_path: fieldPath }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="shrink-0 text-xs text-neutral-500 underline disabled:opacity-50"
    >
      {pending ? "..." : "Not drift -- ignore"}
    </button>
  );
}
