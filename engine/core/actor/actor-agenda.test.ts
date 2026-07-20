import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState } from "../state/state-store.ts";
import {
  clearActorAgenda,
  clearActorKnowledgeLens,
  markActorIndependentAction,
  recordActorKnowledgeFact,
  removeActorKnowledgeFact,
  upsertActorAgenda,
  upsertActorKnowledgeLens,
} from "./actor-agenda.ts";

void test("upsertActorAgenda creates and replaces an agenda for one actor", () => {
  const draft = createInitialState();

  const created = upsertActorAgenda(draft, {
    actorId: draft.public.protagonistActorId,
    goal: " leave the gate ",
    fear: "being watched",
    currentOrder: null,
    lastIndependentActionAt: null,
  });
  const replaced = upsertActorAgenda(draft, {
    actorId: draft.public.protagonistActorId,
    goal: "cross the street",
    fear: "losing time",
    currentOrder: "move now",
    lastIndependentActionAt: "2004-01-30T07:00:00.000Z",
  });

  assert.equal(created.goal, "leave the gate");
  assert.equal(replaced.currentOrder, "move now");
  assert.equal(Object.keys(draft.secrets.actorStates).length, 1);
  assert.equal(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.agenda?.goal,
    "cross the street",
  );
});

void test("markActorIndependentAction stamps current time on an existing agenda", () => {
  const draft = createInitialState();
  upsertActorAgenda(draft, {
    actorId: draft.public.protagonistActorId,
    goal: "watch the road",
    fear: "ambush",
    currentOrder: "wait",
    lastIndependentActionAt: null,
  });

  const agenda = markActorIndependentAction(
    draft,
    draft.public.protagonistActorId,
    "circle the gate",
  );

  assert.equal(agenda.lastIndependentActionAt, draft.public.clock.currentAt);
  assert.equal(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.agenda?.currentOrder,
    "circle the gate",
  );
});

void test("agenda helpers reject missing actors and missing agendas", () => {
  const draft = createInitialState();

  assert.throws(
    () =>
      upsertActorAgenda(draft, {
        actorId: "ghost",
        goal: "watch",
        fear: "light",
        currentOrder: null,
        lastIndependentActionAt: null,
      }),
    /actor ghost 不存在/,
  );
  assert.throws(
    () => markActorIndependentAction(draft, draft.public.protagonistActorId, null),
    /actor agenda/,
  );
  assert.throws(() => clearActorAgenda(draft, draft.public.protagonistActorId), /不存在/);
});

void test("upsertActorKnowledgeLens dedupes fact lists and replaces by actor", () => {
  const draft = createInitialState();

  const lens = upsertActorKnowledgeLens(draft, {
    actorId: draft.public.protagonistActorId,
    knows: ["school gate", " school gate "],
    suspects: ["tail"],
    falseBeliefs: [],
    forbiddenKnowledge: ["hidden true name"],
  });

  assert.deepEqual(lens.knows, ["school gate"]);
  assert.deepEqual(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.knowledgeLens?.forbiddenKnowledge,
    ["hidden true name"],
  );

  upsertActorKnowledgeLens(draft, {
    actorId: draft.public.protagonistActorId,
    knows: ["new fact"],
    suspects: [],
    falseBeliefs: [],
    forbiddenKnowledge: [],
  });

  assert.equal(Object.keys(draft.secrets.actorStates).length, 1);
  assert.deepEqual(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.knowledgeLens?.knows,
    ["new fact"],
  );
});

void test("recordActorKnowledgeFact auto-creates a lens and removes exact facts", () => {
  const draft = createInitialState();

  recordActorKnowledgeFact(
    draft,
    draft.public.protagonistActorId,
    "suspects",
    "someone is watching",
  );
  recordActorKnowledgeFact(
    draft,
    draft.public.protagonistActorId,
    "suspects",
    "someone is watching",
  );
  recordActorKnowledgeFact(
    draft,
    draft.public.protagonistActorId,
    "falseBeliefs",
    "the road is empty",
  );

  assert.deepEqual(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.knowledgeLens?.suspects,
    ["someone is watching"],
  );
  assert.deepEqual(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.knowledgeLens?.falseBeliefs,
    ["the road is empty"],
  );

  removeActorKnowledgeFact(
    draft,
    draft.public.protagonistActorId,
    "suspects",
    "someone is watching",
  );

  assert.deepEqual(
    draft.secrets.actorStates[draft.public.protagonistActorId]?.knowledgeLens?.suspects,
    [],
  );
  assert.throws(
    () =>
      removeActorKnowledgeFact(
        draft,
        draft.public.protagonistActorId,
        "suspects",
        "someone is watching",
      ),
    /不含该 fact/,
  );
});

void test("clearActorKnowledgeLens removes the actor lens", () => {
  const draft = createInitialState();
  recordActorKnowledgeFact(draft, draft.public.protagonistActorId, "knows", "the gate is open");

  const removed = clearActorKnowledgeLens(draft, draft.public.protagonistActorId);

  assert.equal(removed.actorId, draft.public.protagonistActorId);
  assert.deepEqual(draft.secrets.actorStates, {});
});
