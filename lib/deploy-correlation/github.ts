export interface CorrelatedCommit {
  sha: string;
  message: string;
}

/**
 * Finds the most recent commit before a given timestamp on a linked repo,
 * so a drift alert can say "likely caused by commit X" instead of just
 * reporting the symptom. GitHub's authenticated rate limit (5,000 req/hr)
 * comfortably covers this at any early-stage volume.
 */
export async function findNearestCommit(
  repo: string,
  before: Date,
  token?: string
): Promise<CorrelatedCommit | undefined> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`github_repo must be "owner/repo", got "${repo}"`);
  }

  const url = new URL(`https://api.github.com/repos/${owner}/${name}/commits`);
  url.searchParams.set("until", before.toISOString());
  url.searchParams.set("per_page", "1");

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub commits request failed: ${res.status}`);
  }

  const commits = (await res.json()) as Array<{
    sha: string;
    commit: { message: string };
  }>;
  const commit = commits[0];
  if (!commit) return undefined;

  return { sha: commit.sha, message: commit.commit.message.split("\n")[0] };
}

/** e.g. "a1b2c3d: refactor user serializer", matching the alert copy in the guide. */
export function formatCommitLabel(commit: CorrelatedCommit): string {
  return `${commit.sha.slice(0, 7)}: ${commit.message}`;
}
