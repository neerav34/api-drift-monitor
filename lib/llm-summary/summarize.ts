import type { DriftItem } from "@/lib/drift/diff";

export interface SummarizeInput {
  apiName: string;
  endpointMethod: string;
  endpointPath: string;
  driftDetails: DriftItem[];
}

/**
 * Turns a raw diff into a one-sentence, plain-English summary with a guess
 * at cause (backend refactor vs. intentional deprecation) -- what makes the
 * Slack alert legible to a PM instead of just the engineer who wrote the
 * endpoint. Picks whichever free-tier provider has a key configured; on any
 * failure (no key, rate limit, network) it returns undefined and the caller
 * falls back to the raw diff, since a summary is a nice-to-have, not a
 * dependency of the alert firing.
 */
export async function summarizeDrift(
  input: SummarizeInput
): Promise<string | undefined> {
  const prompt = buildPrompt(input);
  try {
    if (process.env.GROQ_API_KEY) return await callGroq(prompt);
    if (process.env.GEMINI_API_KEY) return await callGemini(prompt);
  } catch (err) {
    console.error("LLM drift summary failed:", err);
  }
  return undefined;
}

function buildPrompt({
  apiName,
  endpointMethod,
  endpointPath,
  driftDetails,
}: SummarizeInput): string {
  const diffLines = driftDetails
    .map((d) => `- ${d.type} on \`${d.field}\`${d.expected ? ` (expected ${d.expected}${d.got ? `, got ${d.got}` : ""})` : ""}`)
    .join("\n");

  return [
    `API "${apiName}", endpoint ${endpointMethod} ${endpointPath}, drifted from its spec.`,
    "Diff:",
    diffLines,
    "",
    "Write ONE sentence in plain English (no engineer jargon) describing what changed, and a short guess at the likely cause (e.g. backend refactor, intentional deprecation, new optional field). No preamble, just the sentence.",
  ].join("\n");
}

async function callGroq(prompt: string): Promise<string | undefined> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Groq request failed: ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim();
}

async function callGemini(prompt: string): Promise<string | undefined> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}
