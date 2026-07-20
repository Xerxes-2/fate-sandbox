import assert from "node:assert/strict";
import test from "node:test";

import { cloneState, resetState } from "../../engine/core/state/state-store.ts";
import { updateActorAgendaTool } from "./update-actor-agenda.ts";

void test("updateActorAgendaTool upserts and marks independent action", () => {
  resetState();

  updateActorAgendaTool(
    {
      kind: "upsert",
      actorId: "actor-1",
      goal: "watch the school gate",
      fear: "being boxed in",
      currentOrder: "wait",
    },
    undefined,
  );
  updateActorAgendaTool(
    { kind: "mark-independent-action", actorId: "actor-1", currentOrder: "circle the gate" },
    undefined,
  );

  const agenda = cloneState().secrets.actorStates["actor-1"]?.agenda;
  assert.equal(agenda?.actorId, "actor-1");
  assert.equal(agenda?.currentOrder, "circle the gate");
  assert.equal(agenda?.lastIndependentActionAt, cloneState().public.clock.currentAt);
});

void test("updateActorAgendaTool clears agenda with an audit reason", () => {
  resetState();
  updateActorAgendaTool(
    {
      kind: "upsert",
      actorId: "actor-1",
      goal: "watch the road",
      fear: "ambush",
    },
    undefined,
  );

  const result = updateActorAgendaTool(
    { kind: "clear", actorId: "actor-1", reason: "left the tracked scene" },
    undefined,
  );

  assert.match(result.content[0]?.text ?? "", /已移除/);
  assert.deepEqual(cloneState().secrets.actorStates, {});
});
