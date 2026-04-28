import { DEFAULT_CONFIG, formatRecallBlock } from "./core.js";
import { searchQmd } from "./qmd.js";

const query = process.argv.slice(2).join(" ") || "remember meeting prep";
const config = {
  ...DEFAULT_CONFIG,
  collections: process.env.QMD_RECALL_COLLECTIONS?.split(",").map((s) => s.trim()).filter(Boolean) ?? ["vault"],
  timeoutMs: Number.parseInt(process.env.QMD_RECALL_TIMEOUT_MS ?? "3000", 10),
};

const result = await searchQmd(query, config);
console.log(JSON.stringify({ status: result.status, elapsedMs: result.elapsedMs, hits: result.hits.length, error: result.error }, null, 2));
if (result.status !== "ok") process.exit(1);
const block = formatRecallBlock(result.hits, config);
if (!block) process.exit(2);
console.log("\n--- injected preview ---\n" + block);
