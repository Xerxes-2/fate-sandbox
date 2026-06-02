import assert from "node:assert/strict";
import test from "node:test";

import { exportState, resetState } from "../../engine/core/state";
import { configureCampaignTool } from "./configure-campaign";

void test("configureCampaignTool updates campaign and timezone", () => {
  resetState();

  const result = configureCampaignTool(
    {
      presetId: "fsf_2008_snowfield",
      currentAt: "2008-06-03T03:28:00.000Z",
      premise: "2008 年斯诺菲尔德，绫香·沙条召唤到的 Saber 是两仪式。",
      reason: "当前游戏已确定为 FSF 斯诺菲尔德替换 Saber 线。",
    },
    createNoopSessionManager(),
  );

  assert.match(result.content[0]?.text ?? "", /Campaign 已配置/);
  const state = exportState();
  assert.equal(state.public.campaign.timeline, "fsf");
  assert.equal(state.public.clock.timezone, "America/Denver");
  assert.equal(state.public.clock.displayTime, "2008年06月02日 星期一 21:28");
});

function createNoopSessionManager(): unknown {
  return { appendCustomEntry: () => "entry-test" };
}
