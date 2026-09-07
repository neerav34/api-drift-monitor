import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-tight">API Drift Monitor</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight">
          Know the moment your API drifts from its spec.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Your OpenAPI spec (or MCP server&apos;s tool schema) says one thing.
          Your live service does another. We tell you the moment they
          diverge -- without ever asking for your production credentials.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Card title="Self-hosted by default">
            The checker runs on <em>your</em> GitHub Actions, using{" "}
            <em>your</em> repo secrets. It computes the diff locally and
            posts only a pass/fail result here -- your credentials never
            leave your own infrastructure.
          </Card>
          <Card title="Hosted mode, opt-in">
            Prefer convenience? Give us a scoped, read-only key and we&apos;ll
            check on a schedule instead. Every hosted API is clearly labeled
            in the dashboard so you always know your exposure.
          </Card>
          <Card title="MCP schema drift, too">
            We treat an MCP server&apos;s tool schema the same as an OpenAPI
            contract -- a category almost nobody else is monitoring yet.
          </Card>
          <Card title="Alerts that explain themselves">
            A plain-English summary, the likely commit that caused it, and a
            noise filter so you stop getting paged for the same false
            positive twice.
          </Card>
        </div>

        <Link
          href="/signup"
          className="mt-10 inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Get started
        </Link>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{children}</p>
    </div>
  );
}
