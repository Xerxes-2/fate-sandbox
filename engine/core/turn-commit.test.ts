import assert from "node:assert/strict";
import test from "node:test";

import { getState, resetState } from "./state";
import { commitTurn } from "./turn-commit";

void test("commitTurn applies multiple domain events in order", () => {
  resetState();

  const result = commitTurn({
    summary: "卫宫士郎步行回家并记录当前目标。",
    events: [
      {
        kind: "scene",
        event: {
          kind: "move-location",
          location: {
            region: "冬木市",
            site: "深山镇",
            detail: "卫宫邸",
            boundary: "normal",
          },
          elapsedMinutes: 30,
          reason: "步行回家",
        },
      },
      {
        kind: "scene",
        event: {
          kind: "add-objective",
          summary: "整理今晚的异常遭遇",
          reason: "回合收口",
        },
      },
    ],
  });

  const state = getState();
  assert.equal(state.public.scene.location.detail, "卫宫邸");
  assert.equal(state.public.scene.objectives[0]?.summary, "整理今晚的异常遭遇");
  assert.equal(result.results.length, 2);
  assert.match(result.message, /回合已提交/);
});

void test("commitTurn rejects empty commits", () => {
  resetState();

  assert.throws(
    () => commitTurn({ summary: "没有状态变化。", events: [] }),
    /至少需要一个领域事件/,
  );
});

void test("commitTurn warns when a story window has no active objectives", () => {
  resetState();

  const result = commitTurn({
    summary: "开启只有边界的剧情窗口。",
    events: [
      {
        kind: "scene",
        event: {
          kind: "set-story-window",
          storyWindow: {
            currentArcId: "B2",
            currentBeatId: "wrapup",
            title: "收尾",
            allowedActions: ["撤退"],
            forbiddenEscalations: ["不得开战"],
            completionCriteria: ["安全离开"],
            nextBeatHints: [],
          },
          reason: "锁定 beat",
        },
      },
    ],
  });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /没有未解决的 Scene Objective/);
});

void test("commitTurn can move into a scene beat", () => {
  resetState();

  const result = commitTurn({
    summary: "前往柳洞寺外围并开启侦察。",
    events: [
      {
        kind: "scene-beat",
        event: {
          kind: "move-location",
          input: {
            storyWindow: {
              currentArcId: "B1",
              currentBeatId: "scout",
              title: "柳洞寺外围侦察",
              allowedActions: ["观察", "撤退"],
              forbiddenEscalations: ["不得交战"],
              completionCriteria: ["观察完成", "安全撤回"],
              nextBeatHints: [],
            },
            objectives: ["观察结界", "安全撤回"],
            location: {
              region: "冬木市",
              site: "円藏山",
              detail: "柳洞寺外围·山道",
              boundary: "normal",
            },
            elapsedMinutes: 25,
            situation: "investigation",
            reason: "从穗群原学园前往柳洞寺外围侦察",
          },
        },
      },
    ],
  });

  const state = getState();
  assert.equal(state.public.clock.currentAt, "2004-01-30T07:25:00.000Z");
  assert.equal(state.public.scene.location.detail, "柳洞寺外围·山道");
  assert.equal(state.public.scene.storyWindow?.currentBeatId, "scout");
  assert.equal(result.results.length, 1);
});

void test("commitTurn can transition scene beat by objective summaries", () => {
  resetState();

  commitTurn({
    summary: "开启侦察 beat。",
    events: [
      {
        kind: "scene-beat",
        event: {
          kind: "begin-beat",
          input: {
            storyWindow: {
              currentArcId: "B1",
              currentBeatId: "scout",
              title: "侦察",
              allowedActions: ["观察", "撤退"],
              forbiddenEscalations: ["不得交战"],
              completionCriteria: ["观察完成", "安全撤回"],
              nextBeatHints: [],
            },
            objectives: ["观察结界", "安全撤回"],
            reason: "开始侦察",
          },
        },
      },
    ],
  });

  const result = commitTurn({
    summary: "撤回并记录发现。",
    events: [
      {
        kind: "scene",
        event: {
          kind: "move-location",
          location: {
            region: "冬木市",
            site: "深山镇",
            detail: "卫宫宅",
            boundary: "normal",
          },
          elapsedMinutes: 35,
          reason: "安全撤回",
        },
      },
      {
        kind: "scene-beat",
        event: {
          kind: "transition-beat",
          input: {
            completedBeatId: "scout",
            resolvedObjectiveIds: [],
            resolvedObjectiveSummaries: ["观察结界", "安全撤回"],
            nextBeat: null,
            reason: "侦察完成",
          },
        },
      },
      {
        kind: "memory",
        event: {
          kind: "record-major-event",
          title: "柳洞寺外围侦察",
          summary: "从外围确认柳洞寺存在多层结界，山门是唯一入口。",
          consequences: ["后续接近柳洞寺必须避开山门正面突破"],
        },
      },
    ],
  });

  const state = getState();
  assert.equal(state.public.scene.storyWindow, null);
  assert.equal(state.public.scene.location.detail, "卫宫宅");
  assert.equal(state.public.memory.eventLog[0]?.title, "柳洞寺外围侦察");
  assert.equal(result.results.length, 3);
});
