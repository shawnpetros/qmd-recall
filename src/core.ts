import crypto from "node:crypto";

export type QmdRecallConfig = {
  agents: string[];
  allowedChatTypes: string[];
  timeoutMs: number;
  maxResults: number;
  minScore: number;
  maxSnippetChars: number;
  maxInjectedChars: number;
  queryMode: "message" | "message-and-recent";
  searchMode: "search" | "query" | "vsearch";
  collections: string[];
  qmdCommand: string;
  logSnippets: boolean;
  triggers: {
    minChars: number;
    include: string[];
    exclude: string[];
  };
};

export const DEFAULT_CONFIG: QmdRecallConfig = {
  agents: ["main"],
  allowedChatTypes: ["direct"],
  timeoutMs: 1500,
  maxResults: 3,
  minScore: 0.5,
  maxSnippetChars: 420,
  maxInjectedChars: 1600,
  queryMode: "message",
  searchMode: "search",
  collections: ["vault"],
  qmdCommand: "qmd",
  logSnippets: false,
  triggers: {
    minChars: 24,
    include: [
      "remember",
      "decid",
      "todo",
      "follow up",
      "deadline",
      "meeting",
      "calendar",
      "inbox",
      "email",
      "prep",
      "who is",
      "what happened",
      "what did we say",
    ],
    exclude: ["send it", "yes", "no", "ok", "lol", "thanks", "dope"],
  },
};

export type QmdHit = {
  path: string;
  startLine?: number;
  endLine?: number;
  score?: number;
  snippet: string;
};

export type RecallDecision = {
  shouldRun: boolean;
  reason: string;
};

export function mergeConfig(raw: unknown): QmdRecallConfig {
  const input = raw && typeof raw === "object" ? (raw as Partial<QmdRecallConfig>) : {};
  const triggers = input.triggers && typeof input.triggers === "object" ? input.triggers as Partial<QmdRecallConfig["triggers"]> : {};
  return {
    ...DEFAULT_CONFIG,
    ...input,
    agents: arrayOfStrings(input.agents, DEFAULT_CONFIG.agents),
    allowedChatTypes: arrayOfStrings(input.allowedChatTypes, DEFAULT_CONFIG.allowedChatTypes),
    searchMode: input.searchMode === "query" || input.searchMode === "vsearch" ? input.searchMode : DEFAULT_CONFIG.searchMode,
    collections: arrayOfStrings(input.collections, DEFAULT_CONFIG.collections),
    qmdCommand: typeof input.qmdCommand === "string" && input.qmdCommand.trim() ? input.qmdCommand : DEFAULT_CONFIG.qmdCommand,
    triggers: {
      ...DEFAULT_CONFIG.triggers,
      ...triggers,
      include: arrayOfStrings(triggers.include, DEFAULT_CONFIG.triggers.include),
      exclude: arrayOfStrings(triggers.exclude, DEFAULT_CONFIG.triggers.exclude),
      minChars: positiveNumber(triggers.minChars, DEFAULT_CONFIG.triggers.minChars),
    },
    timeoutMs: positiveNumber(input.timeoutMs, DEFAULT_CONFIG.timeoutMs),
    maxResults: positiveNumber(input.maxResults, DEFAULT_CONFIG.maxResults),
    minScore: typeof input.minScore === "number" ? input.minScore : DEFAULT_CONFIG.minScore,
    maxSnippetChars: positiveNumber(input.maxSnippetChars, DEFAULT_CONFIG.maxSnippetChars),
    maxInjectedChars: positiveNumber(input.maxInjectedChars, DEFAULT_CONFIG.maxInjectedChars),
    logSnippets: input.logSnippets === true,
    queryMode: input.queryMode === "message-and-recent" ? "message-and-recent" : DEFAULT_CONFIG.queryMode,
  };
}

function arrayOfStrings(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function shouldRecall(message: string, config: QmdRecallConfig): RecallDecision {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized) return { shouldRun: false, reason: "empty" };
  const lower = normalized.toLowerCase();
  if (config.triggers.exclude.some((term) => lower === term.toLowerCase())) {
    return { shouldRun: false, reason: "excluded-exact" };
  }
  if (normalized.length < config.triggers.minChars) {
    const matched = config.triggers.include.find((term) => lower.includes(term.toLowerCase()));
    return matched ? { shouldRun: true, reason: `include:${matched}` } : { shouldRun: false, reason: "too-short" };
  }
  const matched = config.triggers.include.find((term) => lower.includes(term.toLowerCase()));
  if (matched) return { shouldRun: true, reason: `include:${matched}` };
  if (/\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|tomorrow|yesterday|today)\b/i.test(normalized)) {
    return { shouldRun: true, reason: "temporal" };
  }
  if (/[?]$/.test(normalized) && /\b(who|what|when|where|why|how)\b/i.test(normalized)) {
    return { shouldRun: true, reason: "question" };
  }
  return { shouldRun: false, reason: "no-trigger" };
}

export function filterHits(hits: QmdHit[], config: QmdRecallConfig): QmdHit[] {
  return hits
    .filter((hit) => typeof hit.snippet === "string" && hit.snippet.trim().length > 0)
    .filter((hit) => hit.score === undefined || hit.score >= config.minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, config.maxResults);
}

export function formatRecallBlock(hits: QmdHit[], config: QmdRecallConfig): string | null {
  const filtered = filterHits(hits, config);
  if (filtered.length === 0) return null;

  const lines = [
    "Relevant memory from QMD:",
    ...filtered.map((hit) => `- ${formatCitation(hit)} ${truncate(cleanSnippet(hit.snippet), config.maxSnippetChars)}`),
    "Use only if relevant. Do not mention memory search unless asked.",
  ];
  const block = lines.join("\n");
  return truncate(block, config.maxInjectedChars);
}

export function formatCitation(hit: QmdHit): string {
  const line = hit.startLine ? `#L${hit.startLine}${hit.endLine && hit.endLine !== hit.startLine ? `-L${hit.endLine}` : ""}` : "";
  return `[${hit.path}${line}]`;
}

export function cleanSnippet(snippet: string): string {
  return snippet.replace(/^@@[^\n]*(?:\n+)?/, "").replace(/\s+/g, " ").trim();
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function queryHash(query: string): string {
  return crypto.createHash("sha256").update(query).digest("hex").slice(0, 12);
}

export function parseQmdJson(stdout: string): QmdHit[] {
  const parsed = JSON.parse(stdout) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown }).results)
      ? ((parsed as { results: unknown[] }).results)
      : [];

  return rows.map((row) => normalizeHit(row)).filter((hit): hit is QmdHit => Boolean(hit));
}

function normalizeHit(row: unknown): QmdHit | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const path = firstString(r.path, r.file, r.source, r.id);
  const snippet = firstString(r.snippet, r.text, r.content, r.body);
  if (!path || !snippet) return null;
  return {
    path,
    snippet,
    startLine: numberish(r.startLine ?? r.start_line ?? r.line),
    endLine: numberish(r.endLine ?? r.end_line),
    score: numberish(r.score),
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberish(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
