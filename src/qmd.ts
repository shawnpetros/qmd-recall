import { QmdHit, QmdRecallConfig, parseQmdJson } from "./core.js";

export type QmdSearchResult = {
  status: "ok" | "timeout" | "error";
  elapsedMs: number;
  hits: QmdHit[];
  error?: string;
};

export async function searchQmd(query: string, config: QmdRecallConfig): Promise<QmdSearchResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetch(config.qmdUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQmdHttpBody(query, config)),
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    const text = await response.text();
    if (!response.ok) return { status: "error", elapsedMs, hits: [], error: `qmd http ${response.status}: ${text.slice(0, 200)}` };
    try {
      return { status: "ok", elapsedMs, hits: parseQmdJson(text) };
    } catch {
      return { status: "error", elapsedMs, hits: [], error: "qmd returned non-json output" };
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (controller.signal.aborted) return { status: "timeout", elapsedMs, hits: [] };
    return { status: "error", elapsedMs, hits: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildQmdHttpBody(query: string, config: QmdRecallConfig): Record<string, unknown> {
  return {
    searches: [{ type: config.searchMode === "vsearch" ? "vec" : "lex", query }],
    collections: config.collections,
    limit: config.maxResults,
  };
}
