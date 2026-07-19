import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneState,
  commitState,
  getState,
  resetState,
} from "../../engine/core/state/state-store.ts";
import { recordObligation } from "../../engine/core/turn/obligations.ts";
import { commitTurnTool, commitTurnToolDefinition } from "./commit-turn.ts";

// objectives/threats 是 beat-scoped：需要在 active beat 里验证 scene objective 事件的用例先开 beat。
// beat 开启现在走 commit_turn 的 begin-beat scene 子事件（backport lotm 8d72578）。
function beginBeatViaTool(objectives: string[]): void {
  commitTurnTool(
    {
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "开启测试 beat。" },
      events: [
        {
          kind: "scene",
          event: {
            kind: "begin-beat",
            title: "测试 beat",
            objectives,
            purpose: "测试设置 beat",
          },
        },
      ],
    },
    createNoopSessionManager(),
  );
}

void test("commit_turn publishes nested event requirements to the model", () => {
  const schema = JSON.stringify(commitTurnToolDefinition.parameters);

  assert.ok(schema.includes('"event":{"type":"object"'));
  assert.match(schema, /complete-beat/);
  assert.match(schema, /claims/);
  assert.match(schema, /record-daily-event/);
  assert.match(
    schema,
    /daily \/ investigation \/ social \/ combat \/ ritual \/ escape \/ downtime/,
  );
  assert.match(schema, /add-objective \/ resolve-objective/);
  assert.match(schema, /spend-money/);
});

void test("commitTurnTool requires top-level time", () => {
  resetState();

  assert.throws(
    () =>
      commitTurnTool(
        {
          events: [],
        },
        createNoopSessionManager(),
      ),
    /time 必须是对象/,
  );
});

void test("commitTurnTool accepts travel time as the only state change", () => {
  resetState();

  const result = commitTurnTool(
    {
      time: {
        kind: "travel",
        elapsedMinutes: 15,
        reason: "前往住宅区入口。",
        location: {
          boundary: "normal",
          detail: "住宅区入口",
          region: "斯诺菲尔德",
          site: "住宅区",
        },
      },
      events: [],
    },
    createNoopSessionManager(),
  );

  assert.match(result.content[0]?.text ?? "", /回合已提交/);
  assert.equal(getState().public.scene.location.detail, "住宅区入口");
});

void test("commitTurnTool accepts canonical non-time event kinds only", () => {
  resetState();
  beginBeatViaTool(["占位目标"]);

  const result = commitTurnTool(
    {
      summary: "添加目标。",
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "添加目标推进一个最小时间单位。" },
      events: [
        {
          kind: "scene",
          event: {
            kind: "add-objective",
            summary: "确认门外是否安全",
          },
        },
      ],
    },
    createNoopSessionManager(),
  );

  assert.match(result.content[0]?.text ?? "", /回合已提交/);
});

void test("commitTurnTool rejects flat payload aliases", () => {
  resetState();

  assert.throws(
    () =>
      commitTurnTool(
        {
          time: { kind: "elapsed", elapsedMinutes: 1, reason: "即时行动也推进一个最小时间单位。" },
          events: [
            {
              kind: "add-objective",
              summary: "确认门外是否安全",
            },
          ],
        },
        createNoopSessionManager(),
      ),
    /非法 commit_turn event.kind/,
  );
});

void test("commitTurnTool ignores blank objectiveId when objectiveSummary is present", () => {
  resetState();
  beginBeatViaTool(["占位目标"]);

  commitTurnTool(
    {
      summary: "添加目标。",
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "添加目标推进一个最小时间单位。" },
      events: [
        {
          kind: "scene",
          event: {
            kind: "add-objective",
            summary: "确认门外是否安全",
          },
        },
      ],
    },
    createNoopSessionManager(),
  );

  const result = commitTurnTool(
    {
      summary: "解决目标。",
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "解决目标推进一个最小时间单位。" },
      events: [
        {
          kind: "scene",
          event: {
            kind: "resolve-objective",
            objectiveId: "",
            objectiveSummary: "确认门外是否安全",
          },
        },
      ],
    },
    createNoopSessionManager(),
  );

  assert.match(result.content[0]?.text ?? "", /回合已提交/);
});

void test("complete-beat settles objective and continued-threat obligations", () => {
  resetState();
  beginBeatViaTool(["Reach the exit."]);
  const draft = cloneState();
  recordObligation(draft, {
    source: "combat-exchange",
    kind: "scene-objective",
    summary: "Land the objective.",
  });
  recordObligation(draft, {
    source: "combat-exchange",
    kind: "scene-threat",
    summary: "Preserve pressure.",
  });
  commitState(draft);

  const result = commitTurnTool(
    {
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "Escape succeeds at a cost." },
      events: [
        {
          kind: "scene",
          event: {
            kind: "complete-beat",
            outcome: "The pair reaches the exit while pursuit continues.",
            nextBeat: {
              title: "Outside, still pursued",
              objectives: ["Create distance."],
              threats: [{ summary: "The pursuer takes a flanking route.", severity: "high" }],
              situation: "escape",
            },
          },
        },
      ],
    },
    createNoopSessionManager(),
  );

  assert.match(result.content[0]?.text ?? "", /回合已提交/);
  assert.deepEqual(getState().public.obligations, []);
});

void test("complete-beat does not erase an unlanded threat obligation", () => {
  resetState();
  beginBeatViaTool(["Reach the exit."]);
  const draft = cloneState();
  recordObligation(draft, {
    source: "combat-exchange",
    kind: "scene-threat",
    summary: "Preserve pressure.",
  });
  commitState(draft);

  assert.throws(
    () =>
      commitTurnTool(
        {
          time: { kind: "elapsed", elapsedMinutes: 1, reason: "The beat closes." },
          events: [
            {
              kind: "scene",
              event: {
                kind: "complete-beat",
                outcome: "The pair reaches the exit.",
                nextBeat: null,
              },
            },
          ],
        },
        createNoopSessionManager(),
      ),
    /scene-threat/,
  );
});

void test("commitTurnTool does not commit state when a later domain event fails", () => {
  resetState();
  const before = getState();

  assert.throws(
    () =>
      commitTurnTool(
        {
          summary: "测试事务原子性。",
          time: { kind: "elapsed", elapsedMinutes: 40, reason: "测试推进时间后失败。" },
          events: [
            {
              kind: "memory",
              event: {
                kind: "record-major-event",
                title: "无效记忆",
                summary: "缺少 claims。",
                consequences: [],
                claims: [],
              },
            },
          ],
        },
        createNoopSessionManager(),
      ),
    /必须提供 claims/,
  );

  // Runner 未 commitState：Game State Store 保持提交前状态。
  assert.equal(getState().public.clock.currentAt, before.public.clock.currentAt);
  assert.equal(getState().public.scene.location.detail, before.public.scene.location.detail);
});

function createNoopSessionManager(): unknown {
  return { appendCustomEntry: () => "entry-test" };
}
