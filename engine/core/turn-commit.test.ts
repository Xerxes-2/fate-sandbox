import assert from "node:assert/strict";
import test from "node:test";

import { getState, resetState } from "./state";
import { commitTurn } from "./turn-commit";

const MIN_TIME = { kind: "elapsed", elapsedMinutes: 1, reason: "推进一个最小时间单位。" } as const;

void test("commitTurn applies mandatory travel time before domain events", () => {
  resetState();

  const result = commitTurn({
    summary: "移动到新都并采购基础物资。",
    time: {
      kind: "travel",
      location: {
        region: "冬木市",
        site: "新都",
        detail: "商业街",
        boundary: "normal",
      },
      elapsedMinutes: 40,
      reason: "移动到新都",
    },
    events: [
      {
        kind: "economy",
        event: {
          kind: "spend-money",
          purseId: "purse-protagonist-cash",
          amount: 3800,
          reason: "采购基础物资",
        },
      },
    ],
  });

  const state = getState();
  assert.equal(state.public.clock.currentAt, "2004-01-30T07:40:00.000Z");
  assert.equal(state.public.scene.location.detail, "商业街");
  assert.equal(state.public.economy.accessibleFunds[0]?.amount, 46200);
  assert.equal(result.results.length, 2);
});

void test("commitTurn accepts elapsed time as the only canonical change", () => {
  resetState();

  const result = commitTurn({
    summary: "守夜到清晨。",
    time: { kind: "elapsed", elapsedMinutes: 420, reason: "灵体化守夜至清晨" },
    events: [],
  });

  assert.equal(getState().public.clock.currentAt, "2004-01-30T14:00:00.000Z");
  assert.match(result.message, /领域事件：1/);
});

void test("commitTurn accepts elapsed time without domain events", () => {
  resetState();

  const result = commitTurn({ summary: "只推进时间。", time: MIN_TIME, events: [] });

  assert.equal(getState().public.clock.currentAt, "2004-01-30T07:01:00.000Z");
  assert.equal(result.results.length, 1);
});

void test("commitTurn rolls back time when a later domain event fails", () => {
  resetState();

  assert.throws(
    () =>
      commitTurn({
        summary: "测试事务回滚。",
        time: {
          kind: "travel",
          location: {
            region: "冬木市",
            site: "新都",
            detail: "商业街",
            boundary: "normal",
          },
          elapsedMinutes: 40,
          reason: "移动到新都",
        },
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
      }),
    /必须提供 claims/,
  );

  const state = getState();
  assert.equal(state.public.clock.currentAt, "2004-01-30T07:00:00.000Z");
  assert.equal(state.public.scene.location.detail, "穗群原学园·校门外");
});

void test("commitTurn auto-closes a beat after resolving the last objective", () => {
  resetState();

  commitTurn({
    summary: "开启调查 beat。",
    time: MIN_TIME,
    events: [
      {
        kind: "scene-beat",
        event: {
          kind: "begin-beat",
          input: {
            storyWindow: {
              currentArcId: "B1",
              currentBeatId: "active-beat",
              title: "当前调查",
              allowedActions: ["调查"],
              forbiddenEscalations: [],
              completionCriteria: ["确认线索"],
              nextBeatHints: [],
            },
            objectives: ["确认线索"],
            reason: "开始调查",
          },
        },
      },
    ],
  });

  const result = commitTurn({
    summary: "解决最后目标。",
    time: MIN_TIME,
    events: [
      {
        kind: "scene",
        event: {
          kind: "resolve-objective",
          objectiveSummary: "确认线索",
          reason: "线索确认",
        },
      },
    ],
  });

  assert.deepEqual(getState().public.scene.objectives, []);
  assert.equal(getState().public.scene.storyWindow, null);
  assert.equal(result.results.length, 3);
});

void test("commitTurn records presence with explicit elapsed time policy", () => {
  resetState();

  const result = commitTurn({
    summary: "凛暂时离场。",
    time: MIN_TIME,
    events: [
      {
        kind: "scene-presence",
        event: {
          presentActorIds: ["protagonist"],
          allyActorIds: [],
          reason: "凛暂时离场",
        },
      },
    ],
  });

  assert.deepEqual(getState().public.scene.presentActorIds, ["protagonist"]);
  assert.equal(result.results[0]?.kind, "scene");
  assert.equal(result.results[1]?.kind, "scene-presence");
});
