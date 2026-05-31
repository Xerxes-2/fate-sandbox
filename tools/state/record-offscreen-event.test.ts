import assert from "node:assert/strict";
import test from "node:test";

import { resetState } from "../../engine/core/state";
import { recordOffscreenEventTool } from "./record-offscreen-event";

void test("record_offscreen_event tool persists a foreshadowed offscreen event", () => {
  resetState();
  const result = recordOffscreenEventTool(
    {
      lineId: "caster-ryudou",
      actorIds: ["protagonist"],
      timeRange: {
        start: "2004-01-30T07:00:00.000Z",
        end: "2004-01-30T08:00:00.000Z",
      },
      visibility: "foreshadowed",
      summary: "柳洞寺结界密度上升。",
      consequences: ["山门外围侦察难度提高。"],
      futureHooks: ["夜间靠近柳洞寺时会先遭遇结界痕迹。"],
      createdFrom: "parallel-line-subagent",
    },
    undefined,
  );

  assert.equal(result.content[0]?.type, "text");
  assert.match(result.content[0]?.text ?? "", /幕后事件已记录/);
});
