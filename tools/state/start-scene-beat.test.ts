import assert from "node:assert/strict";
import test from "node:test";

import { getState, resetState } from "../../engine/core/state";
import { startSceneBeatTool } from "./start-scene-beat";

void test("startSceneBeatTool opens a beat without requiring storyWindow ids", () => {
  resetState();

  const result = startSceneBeatTool(
    {
      title: "柳洞寺外围侦察",
      objectives: ["观察结界", "安全撤回"],
      purpose: "进入柳洞寺外围侦察 beat。",
      threats: [{ summary: "山门附近有从者级别气息", severity: "medium" }],
      presentActorIds: ["protagonist"],
      situation: "investigation",
    },
    createNoopSessionManager(),
  );

  const state = getState();
  assert.match(result.content[0]?.text ?? "", /回合已提交/);
  assert.equal(state.public.scene.storyWindow?.title, "柳洞寺外围侦察");
  assert.equal(state.public.scene.storyWindow.currentArcId, "main");
  assert.match(state.public.scene.storyWindow.currentBeatId, /^beat-/u);
  assert.deepEqual(
    state.public.scene.objectives.map((objective) => objective.summary),
    ["观察结界", "安全撤回"],
  );
  assert.equal(state.public.scene.threats[0]?.summary, "山门附近有从者级别气息");
  assert.deepEqual(state.public.scene.presentActorIds, ["protagonist"]);
  assert.equal(state.public.scene.situation, "investigation");
});

void test("startSceneBeatTool can move into a beat", () => {
  resetState();

  startSceneBeatTool(
    {
      title: "新都商业街调查",
      objectives: ["确认魔力痕迹"],
      purpose: "移动到新都商业街并开始调查。",
      location: {
        region: "冬木市",
        site: "新都",
        detail: "商业街",
        boundary: "normal",
      },
      elapsedMinutes: 40,
    },
    createNoopSessionManager(),
  );

  const state = getState();
  assert.equal(state.public.clock.currentAt, "2004-01-30T07:40:00.000Z");
  assert.equal(state.public.scene.location.detail, "商业街");
  assert.equal(state.public.scene.storyWindow?.title, "新都商业街调查");
});

void test("startSceneBeatTool ignores current location without elapsedMinutes", () => {
  resetState();

  startSceneBeatTool(
    {
      title: "校门口确认情况",
      objectives: ["确认周围是否安全"],
      purpose: "在当前地点开始 beat；模型重复传了当前 location。",
      location: getState().public.scene.location,
    },
    createNoopSessionManager(),
  );

  assert.equal(getState().public.scene.storyWindow?.title, "校门口确认情况");
});

void test("startSceneBeatTool requires location and elapsedMinutes together", () => {
  resetState();

  assert.throws(
    () =>
      startSceneBeatTool(
        {
          title: "缺少时间的移动 beat",
          objectives: ["确认魔力痕迹"],
          purpose: "移动到新都商业街并开始调查。",
          location: {
            region: "冬木市",
            site: "新都",
            detail: "商业街",
            boundary: "normal",
          },
        },
        createNoopSessionManager(),
      ),
    /必须同时提供 location 和 elapsedMinutes/,
  );
});

function createNoopSessionManager(): unknown {
  return { appendCustomEntry: () => "entry-test" };
}
