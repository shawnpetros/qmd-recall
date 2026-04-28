import { spawn } from "node:child_process";
import { QmdHit, QmdRecallConfig, parseQmdJson } from "./core.js";

export type QmdSearchResult = {
  status: "ok" | "timeout" | "error";
  elapsedMs: number;
  hits: QmdHit[];
  error?: string;
};

export async function searchQmd(query: string, config: QmdRecallConfig): Promise<QmdSearchResult> {
  const startedAt = Date.now();
  const args = buildQmdArgs(query, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  timeout.unref?.();

  try {
    const { stdout, stderr, code, signal } = await runProcess(config.qmdCommand, args, controller.signal);
    const elapsedMs = Date.now() - startedAt;
    if (signal === "SIGTERM" || controller.signal.aborted) return { status: "timeout", elapsedMs, hits: [] };
    if (code !== 0) return { status: "error", elapsedMs, hits: [], error: stderr.trim() || `qmd exited ${code}` };
    try {
      return { status: "ok", elapsedMs, hits: parseQmdJson(stdout) };
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

export function buildQmdArgs(query: string, config: QmdRecallConfig): string[] {
  const args = [config.searchMode, query, "--json", "-n", String(config.maxResults)];
  if (config.searchMode === "query") args.push("--no-rerank");
  for (const collection of config.collections) {
    args.push("-c", collection);
  }
  return args;
}

function runProcess(command: string, args: string[], signal: AbortSignal): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const abort = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 250).unref?.();
    };
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, sig) => {
      signal.removeEventListener("abort", abort);
      resolve({ stdout, stderr, code, signal: sig });
    });
  });
}
