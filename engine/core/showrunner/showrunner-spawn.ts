/**
 * Showrunner auditor spawn (engine-direct sync substrate — see ADR 0007).
 *
 * `run_showrunner_audit` fires the hermetic auditor ITSELF — a blocking (NOT
 * detached) `pi -p` child — and awaits its exit inside the tool call, mirroring
 * the backstage spawn seam (ADR 0005) minus detach. Firewall by construction:
 * `--no-extensions -e <timeline extension>` (lookup is the only tool) +
 * `--no-builtin-tools` (no read/bash/edit/write) + `--no-approve
 * --no-context-files --no-skills --no-prompt-templates` (no path back to
 * project state) + `--system-prompt <persona>` (replace semantics: no
 * coding-agent identity) + its own session under the gitignored
 * SHOWRUNNER_SESSION_DIR.
 */

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

import {
  SHOWRUNNER_SESSION_DIR,
  SHOWRUNNER_TIMELINE_EXTENSION,
  SHOWRUNNER_TIMEOUT_MS,
} from "./showrunner-substrate-config.ts";

/**
 * Pure: the argv for the hermetic blocking `pi -p` auditor child (prompt is
 * last). No `--model`: the child uses the settings default (the main model —
 * same rationale as the backstage director, ADR 0005 amendment).
 */
export function buildShowrunnerSpawnArgs(prompt: string, persona: string, runId: string): string[] {
  return [
    "-p",
    "--no-extensions",
    "--extension",
    SHOWRUNNER_TIMELINE_EXTENSION,
    "--no-builtin-tools",
    "--no-approve",
    "--no-context-files",
    "--no-skills",
    "--no-prompt-templates",
    "--system-prompt",
    persona,
    "--session-dir",
    SHOWRUNNER_SESSION_DIR,
    "--session-id",
    runId,
    prompt,
  ];
}

export type ShowrunnerSpawnOutcome =
  | { kind: "exited"; exitCode: number | null }
  | { kind: "killed"; signal: string; timeoutMs: number }
  | { kind: "launch-error"; message: string };

type ShowrunnerSpawner = (
  prompt: string,
  persona: string,
  runId: string,
) => Promise<ShowrunnerSpawnOutcome>;

const defaultSpawner: ShowrunnerSpawner = (prompt, persona, runId) =>
  new Promise((resolve) => {
    // Durable (gitignored) session dir + per-run spawn log so a failed launch is
    // diagnosable (the verdict itself is read from the session jsonl, not stdout).
    mkdirSync(SHOWRUNNER_SESSION_DIR, { recursive: true });
    const logFd = openSync(join(SHOWRUNNER_SESSION_DIR, `${runId}.spawn.log`), "a");
    // 阻塞调用在长寿 GM 进程里反复发生，log fd 必须随子进程终止关闭（error 与
    // exit 可能先后都触发，只关一次）。
    let logFdClosed = false;
    const closeLogFd = (): void => {
      if (!logFdClosed) {
        logFdClosed = true;
        closeSync(logFd);
      }
    };
    // node:child_process 原生 timeout：到点 SIGKILL，避免自管定时器。
    const child = spawn("pi", buildShowrunnerSpawnArgs(prompt, persona, runId), {
      stdio: ["ignore", logFd, logFd],
      cwd: process.cwd(),
      env: process.env,
      timeout: SHOWRUNNER_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    child.once("error", (error) => {
      closeLogFd();
      resolve({ kind: "launch-error", message: error.message });
    });
    child.once("exit", (code, signal) => {
      closeLogFd();
      if (signal !== null) {
        // 信号终止不预设原因：SIGKILL 通常即本 seam 的超时强杀，但也可能是外部
        // kill/OOM；把 signal 原样上报，由 orchestrator 组装诚实的失败详情。
        resolve({ kind: "killed", signal, timeoutMs: SHOWRUNNER_TIMEOUT_MS });
        return;
      }
      resolve({ kind: "exited", exitCode: code });
    });
  });

let spawner: ShowrunnerSpawner = defaultSpawner;

/** Test seam: replace the real blocking spawn with a fake (null restores default). */
export function setShowrunnerSpawnerForTest(fn: ShowrunnerSpawner | null): void {
  spawner = fn ?? defaultSpawner;
}

/** Fire the hermetic auditor child and await its terminal outcome (blocking). */
export function spawnShowrunnerAuditor(
  prompt: string,
  persona: string,
  runId: string,
): Promise<ShowrunnerSpawnOutcome> {
  return spawner(prompt, persona, runId);
}
