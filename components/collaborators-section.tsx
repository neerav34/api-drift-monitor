"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Collaborator {
  id: string;
  user_id: string;
  email: string;
}

/** Owner-only UI (the page decides whether to render this at all) -- add
 * someone by email, remove anyone already added. Both actions hit
 * owner-only routes that double-check ownership server-side regardless of
 * whether this component is ever rendered for a non-owner by mistake. */
export function CollaboratorsSection({
  apiId,
  collaborators,
}: {
  apiId: string;
  collaborators: Collaborator[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const res = await fetch(`/api/apis/${apiId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(body.error ?? "Failed to add collaborator");
      return;
    }

    setEmail("");
    router.refresh();
  }

  async function handleRemove(userId: string) {
    await fetch(`/api/apis/${apiId}/collaborators/${userId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Collaborators</h2>
      <p className="text-xs text-neutral-500">
        Full day-to-day access (view, pause, manual check, noise filter) — only you can delete
        this API or change who has access.
      </p>

      {collaborators.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{c.email}</span>
              <button
                onClick={() => handleRemove(c.user_id)}
                className="text-xs text-neutral-500 underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
          className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          {pending ? "Adding..." : "Add"}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
