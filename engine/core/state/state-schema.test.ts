import assert from "node:assert/strict";
import test from "node:test";

import { upsertActor } from "../actor/actor.ts";
import { isRecord } from "../utils/typebox-validation.ts";
import { parseStateSchema } from "./state-schema.ts";
import { createInitialState } from "./state-store.ts";

void test("parseStateSchema round-trips a freshly initialized state", () => {
  const draft = createInitialState();
  const state = draft;

  const parsed = parseStateSchema(state);

  assert.deepEqual(parsed, state);
});

void test("parseStateSchema rejects unknown enum values with field path", () => {
  const raw = rawState();
  section(section(raw, "public"), "campaign")["timeline"] = "nope";

  assert.throws(() => parseStateSchema(raw), /campaign\.timeline 必须是允许值之一/);
});

void test("parseStateSchema rejects actor registry key mismatch", () => {
  const raw = rawState();
  const playerActorId = defaultPlayerActorId(raw);
  const actors = section(section(raw, "public"), "actors");
  actors["impostor"] = actors[playerActorId];

  assert.throws(
    () => parseStateSchema(raw),
    new RegExp(`actor registry key impostor 与 actor\\.id ${playerActorId} 不一致`),
  );
});

void test("parseStateSchema rejects dangling actor references", () => {
  const raw = rawState();
  section(raw, "public")["allyActorIds"] = ["no-such-actor"];

  assert.throws(() => parseStateSchema(raw), /非法allyActorIds\[\]: actor no-such-actor 不存在/);
});

void test("parseStateSchema defaults a missing offscreenEventLog to an empty array", () => {
  const raw = rawState();
  delete section(raw, "secrets")["offscreenEventLog"];

  const parsed = parseStateSchema(raw);

  assert.deepEqual(parsed.secrets.offscreenEventLog, []);
});

void test("parseStateSchema trims strings and strips unknown fields", () => {
  const raw = rawState();
  section(section(raw, "public"), "campaign")["title"] = "  冬木圣杯战争  ";
  raw["legacyField"] = "should be stripped";

  const parsed = parseStateSchema(raw);

  assert.equal(parsed.public.campaign.title, "冬木圣杯战争");
  assert.equal("legacyField" in parsed, false);
});

void test("parseStateSchema normalizes ISO instants to canonical form", () => {
  const raw = rawState();
  section(section(raw, "public"), "clock")["currentAt"] = "2004-01-30T16:00:00+09:00";

  const parsed = parseStateSchema(raw);

  assert.equal(parsed.public.clock.currentAt, "2004-01-30T07:00:00.000Z");
});

void test("parseStateSchema rejects malformed ISO instants", () => {
  const raw = rawState();
  section(section(raw, "public"), "clock")["currentAt"] = "昨天下午";

  assert.throws(() => parseStateSchema(raw), /clock\.currentAt必须是 ISO 时间字符串/);
});

void test("parseStateSchema rejects actorStates bundle key mismatch and orphans", () => {
  const mismatch = rawState();
  const playerActorId = defaultPlayerActorId(mismatch);
  section(section(mismatch, "secrets"), "actorStates")[playerActorId] = { actorId: "saber" };
  assert.throws(
    () => parseStateSchema(mismatch),
    new RegExp(`actorStates key ${playerActorId} 与 actorId saber 不一致`),
  );

  const orphan = rawState();
  section(section(orphan, "secrets"), "actorStates")["ghost"] = {
    actorId: "ghost",
    secrets: {
      actorId: "ghost",
      hiddenNoblePhantasms: [],
      privateMotives: [],
      unrevealedAffiliations: [],
    },
  };
  assert.throws(() => parseStateSchema(orphan), /非法actorStates key: actor ghost 不存在/);
});

void test("parseStateSchema validates actor agenda facet actorId against bundle key", () => {
  const raw = rawState();
  const playerActorId = defaultPlayerActorId(raw);
  section(section(raw, "secrets"), "actorStates")[playerActorId] = {
    actorId: playerActorId,
    agenda: {
      actorId: "saber",
      goal: "leave the school gate",
      fear: "being watched",
      currentOrder: null,
      lastIndependentActionAt: null,
    },
  };

  assert.throws(
    () => parseStateSchema(raw),
    new RegExp(`actorStates\\.${playerActorId}\\.agenda\\.actorId saber 与 key 不一致`),
  );
});

void test("parseStateSchema validates actor knowledge lens facet actorId against bundle key", () => {
  const raw = rawState();
  const playerActorId = defaultPlayerActorId(raw);
  section(section(raw, "secrets"), "actorStates")[playerActorId] = {
    actorId: playerActorId,
    knowledgeLens: {
      actorId: "saber",
      knows: ["A"],
      suspects: [],
      falseBeliefs: [],
      forbiddenKnowledge: [],
    },
  };

  assert.throws(
    () => parseStateSchema(raw),
    new RegExp(`actorStates\\.${playerActorId}\\.knowledgeLens\\.actorId saber 与 key 不一致`),
  );
});

void test("parseStateSchema normalizes actor agenda independent-action time", () => {
  const raw = rawState();
  const playerActorId = defaultPlayerActorId(raw);
  section(section(raw, "secrets"), "actorStates")[playerActorId] = {
    actorId: playerActorId,
    agenda: {
      actorId: playerActorId,
      goal: "cross the gate",
      fear: "being noticed",
      currentOrder: "move",
      lastIndependentActionAt: "2004-01-30T16:00:00+09:00",
    },
  };

  const parsed = parseStateSchema(raw);

  assert.equal(
    parsed.secrets.actorStates[playerActorId]?.agenda?.lastIndependentActionAt,
    "2004-01-30T07:00:00.000Z",
  );
});

void test("parseStateSchema validates relationship signal actor refs, visibility layers, and ids", () => {
  const raw = rawState();
  const playerActorId = defaultPlayerActorId(raw);
  section(raw, "public")["relationshipSignals"] = [
    {
      id: "relationship-signal-1",
      actorId: playerActorId,
      targetActorId: playerActorId,
      signal: "hesitates before answering",
      interpretation: "guarded concern",
      boundary: "do not overstate intimacy",
      sourceEventId: null,
      visibility: "player-known",
    },
  ];
  section(raw, "secrets")["relationshipSignals"] = [
    {
      id: "relationship-signal-1",
      actorId: playerActorId,
      targetActorId: playerActorId,
      signal: "tests the boundary",
      interpretation: "private suspicion",
      boundary: "do not render directly",
      sourceEventId: null,
      visibility: "secret",
    },
  ];

  assert.throws(() => parseStateSchema(raw), /重复 relationship signal id/);

  section(raw, "secrets")["relationshipSignals"] = [
    {
      id: "relationship-signal-2",
      actorId: "ghost",
      targetActorId: playerActorId,
      signal: "tests the boundary",
      interpretation: "private suspicion",
      boundary: "do not render directly",
      sourceEventId: null,
      visibility: "secret",
    },
  ];
  assert.throws(
    () => parseStateSchema(raw),
    /非法secrets\.relationshipSignals\[\]\.actorId: actor ghost 不存在/,
  );

  section(raw, "public")["relationshipSignals"] = [
    {
      id: "relationship-signal-3",
      actorId: playerActorId,
      targetActorId: playerActorId,
      signal: "hesitates before answering",
      interpretation: "guarded concern",
      boundary: "do not overstate intimacy",
      sourceEventId: null,
      visibility: "secret",
    },
  ];
  section(raw, "secrets")["relationshipSignals"] = [];
  assert.throws(() => parseStateSchema(raw), /public\.relationshipSignals 只能包含 player-known/);
});

void test("parseStateSchema rejects dangling contractedServantIds", () => {
  const raw = rawState();
  const playerActorId = defaultPlayerActorId(raw);
  const protagonist = section(section(section(raw, "public"), "actors"), playerActorId);
  protagonist["roles"] = [
    {
      kind: "master",
      commandSpells: { total: 3, remaining: 3 },
      contractedServantIds: ["no-such-servant"],
    },
  ];

  assert.throws(
    () => parseStateSchema(raw),
    new RegExp(
      `非法actors\\.${playerActorId} contractedServantIds\\[\\]: actor no-such-servant 不存在`,
    ),
  );
});

void test("parseStateSchema rejects dangling servant contract masterActorId", () => {
  const draft = createInitialState();
  upsertActor(draft, {
    kind: "upsert-servant",
    servant: {
      id: "caster",
      internalName: "Caster",
      publicIdentity: "柳洞寺驻留的从者",
      apparentAge: "不明",
      outfit: { label: "深紫色长袍与兜帽", details: "遮住面容" },
      demeanor: "谨慎、孤高",
      className: "Caster",
      trueNameDisplay: "Caster",
      trueNameStatus: "hidden",
      parameters: {
        strength: "E",
        endurance: "D",
        agility: "C",
        mana: "A+",
        luck: "B",
        noblePhantasm: "C",
      },
      classSkills: [],
      personalSkills: [],
      noblePhantasms: [],
      spiritualCore: 100,
      mana: 90,
      spiritualCondition: "完好",
      masterActorId: null,
      masterName: null,
      contractStatus: "masterless",
      manaSupply: "sufficient",
      currentOrder: "守卫柳洞寺山门",
    },
    reason: "测试悬空 master 引用",
  });
  const caster = draft.public.actors["caster"];
  assert.ok(caster?.servantForm);
  caster.servantForm.contract.masterActorId = "no-such-master";

  assert.throws(
    () => parseStateSchema(draft),
    /非法actors\.caster servantForm\.contract\.masterActorId: actor no-such-master 不存在/,
  );
});

void test("parseStateSchema rejects command spells with remaining above total", () => {
  const raw = rawState();
  const protagonist = section(section(section(raw, "public"), "actors"), defaultPlayerActorId(raw));
  protagonist["roles"] = [
    { kind: "master", commandSpells: { total: 3, remaining: 5 }, contractedServantIds: [] },
  ];

  assert.throws(() => parseStateSchema(raw), /remaining 不能大于 total/);
});

function defaultPlayerActorId(raw: Record<string, unknown>): string {
  const actorId = section(raw, "public")["protagonistActorId"];
  if (typeof actorId !== "string") {
    throw new Error("unreachable: protagonistActorId 必须是字符串");
  }
  return actorId;
}

function rawState(): Record<string, unknown> {
  const cloned: unknown = structuredClone(createInitialState());
  if (!isRecord(cloned)) {
    throw new Error("unreachable: state 必须是对象");
  }
  return cloned;
}

function section(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`unreachable: ${key} 必须是对象`);
  }
  return value;
}
