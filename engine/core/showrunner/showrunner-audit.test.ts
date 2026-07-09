import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createInitialState } from "../state/state-store.ts";
import { runShowrunnerAudit } from "./showrunner-audit.ts";
import { VALID_SHOWRUNNER_OUTPUT } from "./showrunner-output-schema.test.ts";
import { type TimelineShowrunnerInput } from "./showrunner-prompt.ts";
import { setShowrunnerSpawnerForTest, type ShowrunnerSpawnOutcome } from "./showrunner-spawn.ts";

const INPUT: TimelineShowrunnerInput = {
  timelineId: "fsf",
  openingMode: "random",
  premise: "False Grail War in Snowfield",
  activeRuleSetIds: ["fsf-false-war"],
  currentArc: "act-1",
  currentBeat: "hospital-visit",
  storyWindow: null,
  playerVisibleFacts: ["city lockdown tightening"],
  recentBeats: ["met Hansa", "news of patrols"],
  suspectedDrift: ["world motion stale"],
};

/** fake spawner that optionally writes a session jsonl fixture before exiting. */
function fakeSpawner(
  sessionDir: string,
  outcome: ShowrunnerSpawnOutcome,
  assistantText?: string,
): { prompts: string[]; personas: string[] } {
  const calls = { prompts: [] as string[], personas: [] as string[] };
  setShowrunnerSpawnerForTest(async (prompt, persona, runId) => {
    calls.prompts.push(prompt);
    calls.personas.push(persona);
    if (assistantText !== undefined) {
      const entry = {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: assistantText }] },
      };
      writeFileSync(join(sessionDir, `2026-07-09T10-00-00_${runId}.jsonl`), JSON.stringify(entry));
    }
    return outcome;
  });
  return calls;
}

void test("runShowrunnerAudit: verdict 只有过 schema gate 才回 GM", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "showrunner-audit-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  const calls = fakeSpawner(
    dir,
    { kind: "exited", exitCode: 0 },
    JSON.stringify(VALID_SHOWRUNNER_OUTPUT),
  );

  const result = await runShowrunnerAudit(createInitialState(), INPUT, dir);
  assert.equal(result.kind, "verdict");
  if (result.kind === "verdict") {
    assert.equal(result.output.verdict, "conditional-pass");
    assert.equal(result.output.worldMotion.status, "stale");
  }
  // the engine assembled prompt + persona itself (no tool_call hook, no guessing)
  assert.match(calls.prompts[0] ?? "", /<timeline_state_context>/);
  assert.match(calls.prompts[0] ?? "", /"timelineId": "fsf"/);
  assert.match(calls.personas[0] ?? "", /timeline-showrunner/);
});

void test("runShowrunnerAudit: schema 不合法 → invalid-output 结构化失败，不漏裸文本", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "showrunner-audit-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  fakeSpawner(
    dir,
    { kind: "exited", exitCode: 0 },
    JSON.stringify({ verdict: "pass", note: "RAW-CHILD-PROSE" }),
  );

  const result = await runShowrunnerAudit(createInitialState(), INPUT, dir);
  assert.equal(result.kind, "failure");
  if (result.kind === "failure") {
    assert.equal(result.reason, "invalid-output");
    assert.match(result.detail, /TimelineShowrunnerOutput/);
    assert.doesNotMatch(result.detail, /RAW-CHILD-PROSE/);
  }
});

void test("runShowrunnerAudit: 超时 → timeout 失败，绝不静默当审计通过", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "showrunner-audit-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  fakeSpawner(dir, { kind: "killed", signal: "SIGKILL", timeoutMs: 300000 });

  const result = await runShowrunnerAudit(createInitialState(), INPUT, dir);
  assert.equal(result.kind, "failure");
  if (result.kind === "failure") {
    assert.equal(result.reason, "timeout");
    assert.match(result.detail, /SIGKILL/);
    assert.match(result.detail, /300000ms/);
  }
});

void test("runShowrunnerAudit: 启动失败与非零退出 → spawn-failed", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "showrunner-audit-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  fakeSpawner(dir, { kind: "launch-error", message: "spawn pi ENOENT" });
  const launchFailed = await runShowrunnerAudit(createInitialState(), INPUT, dir);
  assert.equal(launchFailed.kind, "failure");
  if (launchFailed.kind === "failure") {
    assert.equal(launchFailed.reason, "spawn-failed");
    assert.match(launchFailed.detail, /ENOENT/);
  }

  fakeSpawner(dir, { kind: "exited", exitCode: 1 });
  const exitFailed = await runShowrunnerAudit(createInitialState(), INPUT, dir);
  assert.equal(exitFailed.kind, "failure");
  if (exitFailed.kind === "failure") {
    assert.equal(exitFailed.reason, "spawn-failed");
    assert.match(exitFailed.detail, /退出码 1/);
  }
});

void test("runShowrunnerAudit: 子进程无输出 → no-output 失败", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "showrunner-audit-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  fakeSpawner(dir, { kind: "exited", exitCode: 0 }); // no session file written

  const result = await runShowrunnerAudit(createInitialState(), INPUT, dir);
  assert.equal(result.kind, "failure");
  if (result.kind === "failure") {
    assert.equal(result.reason, "no-output");
  }
});
