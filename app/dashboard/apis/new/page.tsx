"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SpecMode = "baseline" | "openapi" | "mcp";
type CheckMode = "self_hosted" | "hosted";

export default function NewApiPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [specMode, setSpecMode] = useState<SpecMode>("baseline");
  const [specUrl, setSpecUrl] = useState("");
  const [checkMode, setCheckMode] = useState<CheckMode>("self_hosted");
  const [alertWebhook, setAlertWebhook] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const res = await fetch("/api/apis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        base_url: baseUrl,
        spec_mode: specMode,
        spec_url: specMode === "baseline" ? undefined : specUrl || undefined,
        check_mode: checkMode,
        alert_webhook: alertWebhook || undefined,
        github_repo: githubRepo || undefined,
        auth_header: checkMode === "hosted" ? authHeader || undefined : undefined,
      }),
    });

    const body = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(body.error ?? "Failed to create API");
      return;
    }

    router.push(`/dashboard/apis/${body.api.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Add an API</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Orders API"
          />
        </Field>

        <Field label="Base URL">
          <input
            required
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className={inputClass}
            placeholder="https://api.example.com"
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Checking mode</legend>
          <p className="text-xs text-neutral-500">
            Self-hosted (default): you run the checker in your own CI --
            we never see your credentials. Hosted: we call your API on a
            schedule using a key you provide.
          </p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={checkMode === "self_hosted"}
                onChange={() => setCheckMode("self_hosted")}
              />
              Self-hosted
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={checkMode === "hosted"}
                onChange={() => setCheckMode("hosted")}
              />
              Hosted
            </label>
          </div>
        </fieldset>

        <Field label="Spec mode">
          <select
            value={specMode}
            onChange={(e) => setSpecMode(e.target.value as SpecMode)}
            className={inputClass}
          >
            <option value="baseline">No spec -- learn a baseline</option>
            <option value="openapi">OpenAPI</option>
            <option value="mcp">MCP server (self-hosted only for now)</option>
          </select>
        </Field>

        {specMode === "openapi" && (
          <Field label="OpenAPI spec URL">
            <input
              type="url"
              required
              value={specUrl}
              onChange={(e) => setSpecUrl(e.target.value)}
              className={inputClass}
              placeholder="https://api.example.com/openapi.json"
            />
          </Field>
        )}

        {checkMode === "hosted" && (
          <Field label="Auth header (hosted mode -- encrypted at rest)">
            <input
              value={authHeader}
              onChange={(e) => setAuthHeader(e.target.value)}
              className={inputClass}
              placeholder="Authorization: Bearer sk_live_..."
            />
          </Field>
        )}

        <Field label="Alert webhook (Slack or Discord, optional)">
          <input
            type="url"
            value={alertWebhook}
            onChange={(e) => setAlertWebhook(e.target.value)}
            className={inputClass}
            placeholder="https://hooks.slack.com/services/..."
          />
        </Field>

        <Field label="GitHub repo for deploy correlation (optional)">
          <input
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            className={inputClass}
            placeholder="owner/repo"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? "Adding..." : "Add API"}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
