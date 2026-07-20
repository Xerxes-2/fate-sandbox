import assert from "node:assert/strict";
import test from "node:test";

import { sessionKey } from "../../engine/core/state/state-persistence.ts";
import { resetState } from "../../engine/core/state/state-store.ts";
import { updateActorImpressionTool } from "./update-actor-impression.ts";

void test("updateActorImpressionTool persists the committed impression to the session", () => {
  resetState();
  const entries: Array<{ customType: string; data: unknown }> = [];
  const sessionManager = {
    appendCustomEntry(customType: string, data: unknown): string {
      entries.push({ customType, data });
      return "entry-impression";
    },
  };

  const result = updateActorImpressionTool(
    {
      actorId: "actor-1",
      presence: "安静但警觉",
      actionStyle: "先观察出口再回答",
      relationshipPosture: "谨慎合作",
      voiceMaterial: "“先等等。”短句，避免立即承诺。",
    },
    sessionManager,
  );

  assert.match(result.content[0]?.text ?? "", /印象卡已更新/);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.customType, sessionKey());
  const stateEntry = entries[0]?.data;
  assert.ok(isRecord(stateEntry));
  const state = stateEntry["state"];
  assert.ok(isRecord(state));
  const publicState = state["public"];
  assert.ok(isRecord(publicState));
  const impressions = publicState["actorImpressions"];
  assert.ok(isRecord(impressions));
  const impression = impressions["actor-1"];
  assert.ok(isRecord(impression));
  assert.equal(impression["presence"], "安静但警觉");
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
