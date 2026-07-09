import assert from "node:assert/strict";
import test from "node:test";

import { parseShowrunnerOutput } from "./showrunner-output-schema.ts";

export const VALID_SHOWRUNNER_OUTPUT = {
  timelineId: "fsf",
  genreContract: "Snowfield multi-faction chaos",
  driftLevel: "watch",
  verdict: "conditional-pass",
  driftFindings: ["news framing repeated twice"],
  hardBlockers: [],
  requiredCorrections: ["introduce one interactive canon-ecology hook next beat"],
  pressurePalette: ["church-supervision"],
  nextBeatRecommendations: ["Hansa observation window"],
  npcAutonomyChecks: ["tine needs agenda refresh"],
  hookLedger: [
    {
      hook: "hospital dream anomaly",
      status: "active",
      evidence: "recentBeats[2]",
      requiredAction: "pay off or escalate within two beats",
    },
  ],
  mysteryBudget: { status: "healthy", correction: "" },
  worldMotion: {
    status: "stale",
    evidence: "only patrols and broadcasts in recent offscreen events",
    requiredAction: "one actionable trace next beat",
  },
  forbiddenMoves: ["do not cross storyWindow.forbiddenEscalations"],
};

void test("合法裸 JSON 通过验收", () => {
  const output = parseShowrunnerOutput(JSON.stringify(VALID_SHOWRUNNER_OUTPUT));
  assert.equal(output.verdict, "conditional-pass");
  assert.equal(output.driftLevel, "watch");
  assert.equal(output.hookLedger[0]?.status, "active");
});

void test("容忍 JSON 前后噪音（定位首尾大括号）", () => {
  const noisy = `Some preamble.\n${JSON.stringify(VALID_SHOWRUNNER_OUTPUT)}\ntrailing note`;
  const output = parseShowrunnerOutput(noisy);
  assert.equal(output.timelineId, "fsf");
});

void test("缺字段拒绝，错误只报字段路径、不回流裸文本", () => {
  const { mysteryBudget: _dropped, ...missing } = VALID_SHOWRUNNER_OUTPUT;
  const secretMarker = "SECRET-PROSE-MUST-NOT-LEAK";
  const raw = JSON.stringify({ ...missing, driftFindings: [secretMarker] });
  assert.throws(
    (): void => {
      parseShowrunnerOutput(raw);
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /mysteryBudget/);
      assert.doesNotMatch(error.message, new RegExp(secretMarker));
      return true;
    },
  );
});

void test("非法 verdict 枚举被拒绝", () => {
  const raw = JSON.stringify({ ...VALID_SHOWRUNNER_OUTPUT, verdict: "maybe" });
  assert.throws((): void => {
    parseShowrunnerOutput(raw);
  }, /verdict/);
});

void test("非 JSON 输出报错且不含原文", () => {
  assert.throws((): void => {
    parseShowrunnerOutput("I think the story is fine.");
  }, /未返回有效 JSON 对象/);
});
