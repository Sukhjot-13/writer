// lib/ai.ts — DeepSeek client (FR-8/48).
//
// The ONLY file that knows about the AI provider: endpoint, model, prompt
// transport. One change, one file (FR-48): swapping the model or provider
// never touches routes, components, or the editor UI.
//
// Config via env: DEEPSEEK_API_KEY (required), DEEPSEEK_BASE_URL (default
// https://api.deepseek.com), DEEPSEEK_MODEL (default deepseek-chat).
//
// Uses plain fetch — no SDK. Logs token usage to the server console for cost
// visibility (FR-31).

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** True when a DEEPSEEK_API_KEY is configured (FR-30: clear actionable errors otherwise). */
export function hasAIKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export function getAIConfig(): AIConfig {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}

/** Strip a leading markdown code fence ("```html … ```" or "``` … ```") if present. */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "");
  return withoutOpen.replace(/\n?```\s*$/, "").trim();
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/**
 * Call DeepSeek chat completions with the instructions file as system prompt.
 * Temperature ~0.3 for fidelity to the design system (FR-8). Returns the
 * assistant message text; markdown fences stripped (FR-10).
 */
export async function convertWithAI(system: string, user: string): Promise<string> {
  const config = getAIConfig();
  if (!config.apiKey) {
    throw new AIError(
      "DeepSeek API key missing — add DEEPSEEK_API_KEY to .env.local or use Template (offline) mode.",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    throw new AIError("Could not reach the DeepSeek API — check your connection.");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message ? ` — ${body.error.message}` : "";
    throw new AIError(`DeepSeek API error (${res.status})${detail}`, res.status);
  }

  const data = (await res.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    choices?: { message?: { content?: string } }[];
  };

  // Cost visibility (FR-31)
  if (data.usage) {
    const u = data.usage;
    console.log(
      `[ai] ${config.model} — prompt ${u.prompt_tokens ?? "?"} tok, completion ${u.completion_tokens ?? "?"} tok, total ${u.total_tokens ?? "?"} tok`,
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new AIError("DeepSeek returned an empty response.");
  }
  return stripMarkdownFences(content);
}
