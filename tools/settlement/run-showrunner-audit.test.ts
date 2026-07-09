import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { VALID_SHOWRUNNER_OUTPUT } from "../../engine/core/showrunner/showrunner-output-schema.test.ts";
import { setShowrunnerSpawnerForTest } from "../../engine/core/showrunner/showrunner-spawn.ts";
import { resetState } from "../../engine/core/state/state-store.ts";
import { runShowrunnerAuditTool } from "./run-showrunner-audit.ts";

const VALID_PARAMS = {
  timelineId: "fsn",
  openingMode: "selected",
  premise: "Fifth Holy Grail War, night one",
  activeRuleSetIds: ["fsn-grail-war"],
  currentArc: "opening",
  currentBeat: "church-visit",
  playerVisibleFacts: ["Kotomine supervises the war"],
  recentBeats: ["arrived at church"],
  suspectedDrift: ["mystery hook repetition"],
};

/** fake spawner writing the verdict fixture into the injected session dir. */
function fakeVerdictSpawner(sessionDir: string, assistantText: string): { prompts: string[] } {
  const calls = { prompts: [] as string[] };
  setShowrunnerSpawnerForTest(async (prompt, _persona, runId) => {
    calls.prompts.push(prompt);
    const entry = {
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: assistantText }] },
    };
    writeFileSync(join(sessionDir, `2026-07-09T10-00-00_${runId}.jsonl`), JSON.stringify(entry));
    return { kind: "exited" as const, exitCode: 0 };
  });
  return calls;
}

void test("runShowrunnerAuditTool: engine 阻塞起审计员，verdict 过 gate 后返回 GM", async (t) => {
  resetState();
  const dir = mkdtempSync(join(tmpdir(), "showrunner-tool-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  const calls = fakeVerdictSpawner(dir, JSON.stringify(VALID_SHOWRUNNER_OUTPUT));

  const result = await runShowrunnerAuditTool(VALID_PARAMS, undefined, dir);

  const text = result.content[0]?.text ?? "";
  assert.match(text, /审计完成/);
  assert.match(text, /verdict: conditional-pass/);
  assert.match(text, /requiredCorrections/);
  assert.equal(typeof result.details["runId"], "string");
  const verdict = result.details["verdict"];
  assert.ok(verdict !== null && typeof verdict === "object");

  // storyWindow 省略 → 引擎归一化为 null；投影由 engine 内嵌（单一写入者）
  assert.match(calls.prompts[0] ?? "", /"storyWindow": null/);
  assert.match(calls.prompts[0] ?? "", /<timeline_state_context>/);
});

void test("runShowrunnerAuditTool: 失败分支返回结构化失败，不静默当通过", async (t) => {
  resetState();
  const dir = mkdtempSync(join(tmpdir(), "showrunner-tool-"));
  t.after(() => {
    setShowrunnerSpawnerForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });
  setShowrunnerSpawnerForTest(async () => ({
    kind: "killed" as const,
    signal: "SIGKILL",
    timeoutMs: 300000,
  }));

  const result = await runShowrunnerAuditTool(VALID_PARAMS, undefined, dir);
  const text = result.content[0]?.text ?? "";
  assert.match(text, /审计失败（timeout）/);
  assert.match(text, /失败不算审计通过/);
  assert.equal(result.details["reason"], "timeout");
});

void test("runShowrunnerAuditTool: 烂输入在工具边界被拒（typed 参数是防线）", async () => {
  resetState();
  // 缺 premise
  const { premise: _dropped, ...missing } = VALID_PARAMS;
  await assert.rejects(async () => runShowrunnerAuditTool(missing, undefined), /premise/);
  // 非法 timelineId 枚举
  await assert.rejects(
    async () => runShowrunnerAuditTool({ ...VALID_PARAMS, timelineId: "sao" }, undefined),
    /timelineId/,
  );
});
