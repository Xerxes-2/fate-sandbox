/**
 * Showrunner Audit orchestration (engine-owned sync seam — ADR 0007).
 *
 * One entry: assemble the audit prompt, fire the blocking auditor child, read
 * back the session verdict, and gate it through the TimelineShowrunnerOutput
 * schema. Every failure face (spawn, timeout, no output, invalid output) maps
 * to a structured failure branch — zero engine-side retries; the GM decides
 * whether to re-call. A failed audit is never a silent pass.
 */

import type { TimelineShowrunnerOutput } from "./showrunner-output-schema.ts";
import type { TimelineShowrunnerInput } from "./showrunner-prompt.ts";

import { parseShowrunnerOutput } from "./showrunner-output-schema.ts";
import { TIMELINE_SHOWRUNNER_PERSONA } from "./showrunner-persona.ts";
import { buildShowrunnerAuditPrompt } from "./showrunner-prompt.ts";
import { readShowrunnerOutputRaw } from "./showrunner-session-read.ts";
import { spawnShowrunnerAuditor } from "./showrunner-spawn.ts";

export type ShowrunnerAuditFailureReason =
  | "spawn-failed"
  | "timeout"
  | "no-output"
  | "invalid-output";

export type ShowrunnerAuditResult =
  | { kind: "verdict"; runId: string; output: TimelineShowrunnerOutput }
  | { kind: "failure"; runId: string; reason: ShowrunnerAuditFailureReason; detail: string };

let runCounter = 0;

/** Unique per call: reading right after exit must never pick up a stale run. */
function newShowrunnerRunId(): string {
  runCounter += 1;
  return `sr-${Date.now().toString(36)}-${runCounter}`;
}

/** sessionDir 仅供测试注入临时夹具目录；生产走默认 SHOWRUNNER_SESSION_DIR。 */
export async function runShowrunnerAudit(
  rawState: unknown,
  input: TimelineShowrunnerInput,
  sessionDir?: string,
): Promise<ShowrunnerAuditResult> {
  const prompt = buildShowrunnerAuditPrompt(rawState, input);
  const runId = newShowrunnerRunId();
  const outcome = await spawnShowrunnerAuditor(prompt, TIMELINE_SHOWRUNNER_PERSONA, runId);
  if (outcome.kind === "launch-error") {
    return failure(runId, "spawn-failed", `审计子进程启动失败：${outcome.message}`);
  }
  if (outcome.kind === "killed") {
    return failure(
      runId,
      "timeout",
      `审计子进程被 ${outcome.signal} 终止（超时上限 ${outcome.timeoutMs}ms；SIGKILL 通常即超时强杀，也可能是外部终止）。`,
    );
  }
  if (outcome.exitCode !== 0) {
    return failure(
      runId,
      "spawn-failed",
      `审计子进程退出码 ${outcome.exitCode ?? "unknown"}（详见 ${runId}.spawn.log）。`,
    );
  }
  let raw: string;
  try {
    raw = readShowrunnerOutputRaw(runId, sessionDir);
  } catch (error) {
    return failure(runId, "no-output", errorMessage(error));
  }
  try {
    return { kind: "verdict", runId, output: parseShowrunnerOutput(raw) };
  } catch (error) {
    return failure(runId, "invalid-output", errorMessage(error));
  }
}

function failure(
  runId: string,
  reason: ShowrunnerAuditFailureReason,
  detail: string,
): ShowrunnerAuditResult {
  return { kind: "failure", runId, reason, detail };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
