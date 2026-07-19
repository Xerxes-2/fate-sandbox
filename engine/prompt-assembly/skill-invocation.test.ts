import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCompletedSkillInvocation,
  formatSkillPlayerInput,
  parseSkillInvocation,
} from "./skill-invocation.ts";

void test("parseSkillInvocation extracts the Pi wrapper and trailing arguments", () => {
  const invocation = parseSkillInvocation(
    [
      '<skill name="start-game" location="/game/skills/start-game/SKILL.md">',
      "References are relative to /game/skills/start-game.",
      "",
      "# Start Game",
      "instructions",
      "</skill>",
      "",
      "FSF，新手模式",
    ].join("\n"),
  );

  assert.deepEqual(invocation, { name: "start-game", argumentsText: "FSF，新手模式" });
  assert.equal(formatSkillPlayerInput(invocation), "/skill:start-game FSF，新手模式");
  assert.equal(
    formatCompletedSkillInvocation(invocation),
    "[已完成技能调用]\n玩家调用 /skill:start-game\n参数：FSF，新手模式",
  );
});

void test("parseSkillInvocation rejects ordinary player text and incomplete wrappers", () => {
  assert.equal(parseSkillInvocation("开始游戏"), undefined);
  assert.equal(
    parseSkillInvocation('<skill name="start-game" location="/game/SKILL.md">\nincomplete'),
    undefined,
  );
});
