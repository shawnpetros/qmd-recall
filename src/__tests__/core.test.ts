import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, cleanSnippet, filterHits, formatRecallBlock, parseQmdJson, shouldRecall } from "../core.js";

test("shouldRecall skips short acknowledgements", () => {
  assert.equal(shouldRecall("send it", DEFAULT_CONFIG).shouldRun, false);
  assert.equal(shouldRecall("lol", DEFAULT_CONFIG).shouldRun, false);
});

test("shouldRecall triggers on project and memory language", () => {
  assert.deepEqual(shouldRecall("What did we decide about launch equity?", DEFAULT_CONFIG).shouldRun, true);
  assert.deepEqual(shouldRecall("remember what the client said about the appointment", DEFAULT_CONFIG).shouldRun, true);
});

test("parseQmdJson handles result envelopes", () => {
  const hits = parseQmdJson(JSON.stringify({ results: [{ path: "MEMORY.md", startLine: 12, score: 0.91, snippet: "hello world" }] }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.path, "MEMORY.md");
});

test("filterHits applies min score and max results", () => {
  const hits = filterHits([
    { path: "a", score: 0.9, snippet: "a" },
    { path: "b", score: 0.5, snippet: "b" },
    { path: "c", score: 0.8, snippet: "c" },
  ], DEFAULT_CONFIG);
  assert.equal(hits.length, 3);
  assert.equal(hits[0]?.path, "a");
  assert.equal(hits[1]?.path, "c");
  assert.equal(hits[2]?.path, "b");
});

test("formatRecallBlock cites sources", () => {
  const block = formatRecallBlock([{ path: "memory/day.md", startLine: 4, endLine: 5, score: 0.9, snippet: "Useful context" }], DEFAULT_CONFIG);
  assert.match(block ?? "", /Relevant memory from QMD/);
  assert.match(block ?? "", /memory\/day.md#L4-L5/);
});

test("cleanSnippet compacts whitespace", () => {
  assert.equal(cleanSnippet(" hello\n\nworld "), "hello world");
});
