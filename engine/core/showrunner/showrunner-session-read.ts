/**
 * Showrunner auditor session read-back (engine-owned retrieval — ADR 0007).
 *
 * The blocking child writes its verdict to a durable session jsonl at
 * `<sessionDir>/<ISO-timestamp>_<runId>.jsonl`. After the child exits, the
 * engine locates the run's newest session file and extracts the last assistant
 * text (the bare verdict JSON) — symmetric with the backstage harvest read.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { extractLastAssistantText } from "../backstage/backstage-session-read.ts";
import { SHOWRUNNER_SESSION_DIR } from "./showrunner-substrate-config.ts";

/**
 * Locate the newest session jsonl for an audit run and return its bare verdict
 * text. Files are named `<ISO-timestamp>_<runId>.jsonl`, so the ISO prefix
 * sorts chronologically — the lexicographically last match is the newest run.
 */
export function readShowrunnerOutputRaw(
  runId: string,
  sessionDir: string = SHOWRUNNER_SESSION_DIR,
): string {
  let files: string[];
  try {
    files = readdirSync(sessionDir);
  } catch {
    throw new Error(`showrunner session 目录不存在：${sessionDir}（审计子进程未启动？）。`);
  }
  const suffix = `_${runId}.jsonl`;
  const matches = files.filter((name) => name.endsWith(suffix)).toSorted();
  const newest = matches.length > 0 ? matches[matches.length - 1] : undefined;
  if (newest === undefined) {
    throw new Error(`找不到 run_id=${runId} 的 showrunner session（子进程未写出 session）。`);
  }
  try {
    return extractLastAssistantText(readFileSync(join(sessionDir, newest), "utf8"));
  } catch (cause) {
    throw new Error(
      `showrunner session 里没有 assistant 输出（子进程可能中途失败，查看 ${runId}.spawn.log）。`,
      { cause },
    );
  }
}
