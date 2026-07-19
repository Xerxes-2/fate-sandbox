/**
 * Backstage director session read-back (engine-owned harvest retrieval — ADR 0005).
 *
 * The engine forks the director (backstage-spawn.ts); the child writes its
 * candidate to a durable session jsonl at
 * `<sessionDir>/<ISO-timestamp>_<runId>.jsonl`. This module closes the loop on the
 * READ side: given a runId, locate the run's newest session file and extract the
 * last assistant text part (the bare candidate JSON). No pi-actors / `inspect`:
 * the engine owns both spawn and harvest retrieval, symmetric per ADR 0005.
 */

import { readdirSync, readFileSync } from "node:fs";
import { watch } from "node:fs/promises";
import { join } from "node:path";

import { isRecord } from "../utils/typebox-validation.ts";
import { BACKSTAGE_SESSION_DIR } from "./backstage-substrate-config.ts";

/**
 * Pure: extract the last assistant text part from a director session jsonl body.
 * Each line is one session entry; the candidate lives in the final
 * `type:"message"` / `role:"assistant"` entry's `content[]` `type:"text"` part
 * (a sibling `thinking` part is skipped). Throws when no assistant text exists
 * yet (director not finished).
 */
export function extractLastAssistantText(jsonl: string): string {
  const result = tryExtractLastAssistantText(jsonl);
  if (result.kind === "ready") {
    return result.raw;
  }
  throw new Error("后台 director session 里还没有 assistant 候选（导演可能尚未跑完）。");
}

export type BackstageCandidateReadResult =
  | { kind: "ready"; raw: string }
  | { kind: "pending"; reason: "session-not-created" | "candidate-not-written" };

function tryExtractLastAssistantText(jsonl: string): BackstageCandidateReadResult {
  const lines = jsonl.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? "").trim();
    if (line === "") {
      continue;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // tolerate a partially-flushed trailing line
    }
    if (!isRecord(entry) || entry["type"] !== "message") {
      continue;
    }
    const message = entry["message"];
    if (!isRecord(message) || message["role"] !== "assistant") {
      continue;
    }
    const content = message["content"];
    if (!Array.isArray(content)) {
      continue;
    }
    const text = content
      .filter((part): part is Record<string, unknown> => isRecord(part) && part["type"] === "text")
      .map((part) => (typeof part["text"] === "string" ? part["text"] : ""))
      .join("");
    if (text.trim() !== "") {
      return { kind: "ready", raw: text };
    }
  }
  return { kind: "pending", reason: "candidate-not-written" };
}

/**
 * Locate the newest session jsonl for a run and return its bare candidate text.
 * Files are named `<ISO-timestamp>_<runId>.jsonl`, so the ISO prefix sorts
 * chronologically — the lexicographically last match is the newest run.
 */
export function readBackstageCandidateRaw(
  runId: string,
  sessionDir: string = BACKSTAGE_SESSION_DIR,
): string {
  const result = tryReadBackstageCandidateRaw(runId, sessionDir);
  if (result.kind === "ready") {
    return result.raw;
  }
  if (result.reason === "session-not-created") {
    throw new Error(`找不到 run_id=${runId} 的后台 director session（未启动，或 run_id 拼错）。`);
  }
  throw new Error("后台 director session 里还没有 assistant 候选（导演可能尚未跑完）。");
}

export function tryReadBackstageCandidateRaw(
  runId: string,
  sessionDir: string = BACKSTAGE_SESSION_DIR,
): BackstageCandidateReadResult {
  let files: string[];
  try {
    files = readdirSync(sessionDir);
  } catch {
    throw new Error(
      `后台 session 目录不存在：${sessionDir}。请确认 run_parallel_line 已启动，且后台 session 目录配置正确。`,
    );
  }
  const suffix = `_${runId}.jsonl`;
  const matches = files.filter((name) => name.endsWith(suffix)).toSorted();
  const newest = matches.length > 0 ? matches[matches.length - 1] : undefined;
  if (newest === undefined) {
    return { kind: "pending", reason: "session-not-created" };
  }
  return tryExtractLastAssistantText(readFileSync(join(sessionDir, newest), "utf8"));
}

export interface WaitForBackstageCandidateOptions {
  sessionDir?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function waitForBackstageCandidateRaw(
  runId: string,
  options: WaitForBackstageCandidateOptions,
): Promise<string> {
  const sessionDir = options.sessionDir ?? BACKSTAGE_SESSION_DIR;
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const closeController = new AbortController();
  const signals = [timeoutSignal, closeController.signal];
  if (options.signal !== undefined) {
    signals.push(options.signal);
  }
  const watcher = watch(sessionDir, { signal: AbortSignal.any(signals) });
  try {
    const immediate = tryReadBackstageCandidateRaw(runId, sessionDir);
    if (immediate.kind === "ready") {
      return immediate.raw;
    }
    for await (const change of watcher) {
      if (change.filename !== null && !change.filename.endsWith(`_${runId}.jsonl`)) {
        continue;
      }
      const result = tryReadBackstageCandidateRaw(runId, sessionDir);
      if (result.kind === "ready") {
        return result.raw;
      }
    }
  } catch (error) {
    if (options.signal?.aborted === true) {
      throw new Error(`harvest_backstage_candidate 已取消：run_id=${runId}。`, { cause: error });
    }
    if (timeoutSignal.aborted) {
      throw new Error(
        `后台 director 在 ${options.timeoutMs}ms 内未产出候选：run_id=${runId}。pending-harvest 义务保持不变，请检查对应 spawn log。`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    closeController.abort();
  }
  throw new Error(`后台 director watcher 意外结束：run_id=${runId}。`);
}
