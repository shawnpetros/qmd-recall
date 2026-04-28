# QMD Recall Spec

## Product thesis

QMD Recall is a deterministic OpenClaw memory-retrieval plugin that replaces the fragile parts of Active Memory.

Active Memory proved the UX need: before an assistant answers, it should occasionally pull relevant long-term context from the user's vault/wiki/session memory. Its failure was architectural: it launches an embedded LLM subagent in the pre-answer hot path, which can hang, timeout, and add painful latency while returning no useful context.

QMD Recall treats recall as retrieval, not reasoning.

## Goals

- Pull relevant QMD memory into OpenClaw before prompt build.
- Never run an embedded LLM subagent.
- Never block the user longer than a configured hard timeout.
- Fail closed: if search fails, inject nothing.
- Be safe by default for private memory.
- Ship as an open-source-quality plugin, not a local one-off hack.

## Non-goals

- Replace QMD.
- Build a new vector database.
- Summarize memories with an LLM.
- Support shared/client channels by default.
- Guarantee recall on every turn.

## Default behavior

On `before_prompt_build`:

1. Resolve agent and chat type.
2. Skip unless agent and chat type are allowed by config.
3. Build a query from the latest user prompt.
4. Run deterministic trigger logic.
5. If triggered, execute QMD directly with a hard timeout.
6. Parse JSON results.
7. Filter by score and top-k.
8. Format a compact cited context block.
9. Return `{ prependContext }`.

## Safety defaults

- `allowedChatTypes: ["direct"]`
- `agents: ["main"]`
- `logSnippets: false`
- hard timeout defaults to 1500ms
- max injected characters defaults to 1600

Shared channels must opt in explicitly.

## Config surface

```json
{
  "agents": ["main"],
  "allowedChatTypes": ["direct"],
  "timeoutMs": 1500,
  "maxResults": 3,
  "minScore": 0.5,
  "maxSnippetChars": 420,
  "maxInjectedChars": 1600,
  "queryMode": "message",
  "searchMode": "search",
  "collections": ["vault"],
  "qmdUrl": "http://localhost:8181/query",
  "logSnippets": false,
  "triggers": {
    "minChars": 24,
    "include": ["remember", "decid", "todo", "follow up", "deadline", "meeting", "calendar", "inbox", "email", "prep"],
    "exclude": ["send it", "yes", "no", "ok", "lol", "thanks", "dope"]
  }
}
```

## Hook contract

Observed OpenClaw 2026.4.24 Active Memory uses:

```ts
api.on("before_prompt_build", async (event, ctx) => {
  return { prependContext: promptPrefix };
});
```

QMD Recall targets this contract.

## Injection format

```text
Relevant memory from QMD:
- [memory/2026-04-28.md#L4-L8] Short compact snippet...
- [10-Projects/Launch.md#L1-L5] Short compact snippet...
Use only if relevant. Do not mention memory search unless asked.
```

## Acceptance criteria

- `npm run check` passes.
- Plugin builds without requiring a published `@openclaw/plugin-sdk` package.
- Unit tests cover trigger, parsing, filtering, citation formatting.
- README includes install, config, safety model, troubleshooting, one-prompt install.
- Plugin does not modify live OpenClaw config during install.
- If QMD is slow or broken, assistant turn still proceeds.

## Open questions

1. Confirm plugin `path` loading semantics for external project folders.
2. Decide whether to publish via ClawHub, npm, or both.
3. Add `/qmd-recall status` command once the hook path is verified.
4. Add a first-class QMD provider adapter if QMD exposes a stable HTTP or Node API.
