# Design notes

## Product stance

QMD Recall is built as a public OpenClaw plugin, not a one-off local workaround.

The core design rule: anything in the pre-answer hot path must be deterministic, bounded, and fail-closed.

## Why not active-memory?

`active-memory` uses an embedded agent to decide and summarize recall. That gives it flexibility, but it also means a second model run happens before the real model run. When the embedded path hangs, the user waits and gets no memory anyway.

QMD Recall removes the embedded agent entirely. It trusts QMD to rank results and injects the smallest useful cited context block.

## Hook contract

Observed OpenClaw 2026.4.24 behavior from the compiled active-memory plugin:

```ts
api.on("before_prompt_build", async (event, ctx) => {
  return { prependContext: "..." };
});
```

The event includes at least:

- `event.prompt`: latest prompt text
- `event.messages`: recent message history

The context includes at least:

- `ctx.sessionKey`
- `ctx.sessionId`
- `ctx.agentId` in some contexts
- provider/channel identifiers in some contexts

## Failure behavior

- no trigger: return undefined
- disallowed channel: return undefined
- QMD timeout: return undefined
- QMD error: return undefined
- no high-confidence hits: return undefined

No failure should block a user-facing assistant reply.

## Security and privacy

Default direct-only matters. Retrieval from a personal vault must not silently leak into shared client Slack or public Discord. Future versions can add per-channel corpus maps, but they must default closed.
