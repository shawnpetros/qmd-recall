import { formatRecallBlock, mergeConfig, queryHash, shouldRecall, type QmdRecallConfig } from "./core.js";
import { searchQmd } from "./qmd.js";

type PromptBuildEvent = {
  prompt?: string;
  messages?: Array<{ role?: string; content?: unknown; text?: string }>;
};

type HookContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  chatType?: string;
  messageProvider?: string;
  channelId?: string;
};

type PluginApi = {
  pluginConfig?: unknown;
  logger: {
    debug?: (message: string) => void;
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
  on: (hookName: string, handler: (event: PromptBuildEvent, ctx?: HookContext) => unknown | Promise<unknown>) => void;
};

function definePluginEntry<T extends { id: string; name: string; description?: string; register: (api: PluginApi) => void }>(entry: T): T {
  return entry;
}

function resolveAgentId(ctx?: HookContext): string {
  if (ctx?.agentId?.trim()) return ctx.agentId.trim();
  const sessionKey = ctx?.sessionKey ?? "";
  const match = /^agent:([^:]+)/.exec(sessionKey);
  return match?.[1] ?? "unknown";
}

function resolveChatType(ctx?: HookContext): string {
  if (ctx?.chatType) return ctx.chatType;
  // Transport-specific session key hints are best-effort only. Unknown remains denied by default.
  const key = ctx?.sessionKey ?? "";
  if (key.includes(":telegram:direct:")) return "direct";
  if (key.includes(":slack:") || key.includes(":telegram:group:")) return "group";
  return "unknown";
}

function isAllowedContext(config: QmdRecallConfig, ctx?: HookContext): boolean {
  const agent = resolveAgentId(ctx);
  const chatType = resolveChatType(ctx);
  return config.agents.includes(agent) && config.allowedChatTypes.includes(chatType);
}

function buildQuery(event: PromptBuildEvent, config: QmdRecallConfig): string {
  const latest = (event.prompt ?? "").trim();
  const recent = (event.messages ?? [])
    .filter((m) => m.role === "user")
    .slice(-1)
    .map((m) => extractMessageText(m))
    .filter(Boolean)
    .join("\n");

  if (config.queryMode === "message") return latest || recent;
  return [recent, latest].filter(Boolean).join("\n").trim();
}

function extractMessageText(message: { content?: unknown; text?: string }): string {
  if (typeof message.text === "string") return message.text;
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export default definePluginEntry({
  id: "qmd-recall",
  name: "QMD Recall",
  description: "Deterministic QMD before-prompt recall for OpenClaw.",

  register(api) {
    api.on("before_prompt_build", async (event: PromptBuildEvent, ctx?: HookContext) => {
      const config = mergeConfig(api.pluginConfig);
      const startedAt = Date.now();
      const query = buildQuery(event, config);
      const hash = queryHash(query);

      if (!isAllowedContext(config, ctx)) {
        api.logger.debug?.(`qmd-recall: skip context agent=${resolveAgentId(ctx)} chatType=${resolveChatType(ctx)}`);
        return;
      }

      const decision = shouldRecall(query, config);
      if (!decision.shouldRun) {
        api.logger.debug?.(`qmd-recall: skip query=${hash} reason=${decision.reason}`);
        return;
      }

      const result = await searchQmd(query, config);
      if (result.status !== "ok") {
        const error = config.logSnippets && result.error ? ` error=${singleLine(result.error)}` : "";
        api.logger.warn?.(`qmd-recall: ${result.status} query=${hash} elapsedMs=${result.elapsedMs}${error}`);
        return;
      }

      const block = formatRecallBlock(result.hits, config);
      api.logger.info?.(
        `qmd-recall: done query=${hash} status=${block ? "injected" : "empty"} elapsedMs=${Date.now() - startedAt} hits=${result.hits.length}`,
      );
      if (!block) return;
      return { prependContext: block };
    });
  },
});

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 240);
}
