import assert from "node:assert/strict";
import test from "node:test";

import { configureCampaign } from "./campaign";
import { exportState, getState, resetState } from "./state";

void test("configureCampaign applies FSF Snowfield preset", () => {
  resetState();

  const result = configureCampaign({
    presetId: "fsf_2008_snowfield",
    currentAt: "2008-06-03T03:28:00.000Z",
    premise: "2008 年斯诺菲尔德，绫香·沙条召唤到的 Saber 是两仪式。",
    reason: "测试切换到 FSF 斯诺菲尔德线",
  });

  const state = getState();
  assert.equal(result.message, "Campaign 已配置：Fate/strange Fake 沙盒 (fsf, America/Denver)。");
  assert.equal(state.public.campaign.timeline, "fsf");
  assert.equal(state.public.clock.timezone, "America/Denver");
  assert.equal(state.public.clock.currentAt, "2008-06-03T03:28:00.000Z");
  assert.equal(state.public.scene.location.region, "斯诺菲尔德");
  assert.equal(state.public.economy.currency, "USD");
  assert.equal(state.public.economy.accessibleFunds[0]?.amount, 200);
  assert.equal(exportState().public.clock.displayTime, "2008年06月02日 星期一 21:28");
});

void test("configureCampaign rejects unknown preset", () => {
  resetState();

  assert.throws(
    () => configureCampaign({ presetId: "missing", reason: "测试未知 preset" }),
    /campaign preset 不存在: missing/,
  );
});
