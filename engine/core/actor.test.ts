import assert from "node:assert/strict";
import test from "node:test";

import { upsertActor } from "./actor";
import { buildGmBrief } from "./gm-brief";
import { getPublicState, resetState } from "./state";

void test("upsertActor adds an entered NPC to actor registry and present actors", () => {
  resetState();

  const result = upsertActor({
    actor: {
      id: "tohsaka-rin",
      kind: "human",
      roles: [{ kind: "social", label: "穗群原学园学生" }],
      magecraft: null,
      servantForm: null,
      identity: {
        publicIdentity: "远坂凛",
        background: "玩家已知的穗群原学园学生。",
        lockedFacts: [],
      },
      presentation: {
        displayName: "远坂凛",
        apparentAge: "十七岁左右",
        outfit: { label: "穗群原学园制服", details: "红色外套与黑色长袜。" },
        demeanor: "优等生式的从容。",
      },
      condition: { wounds: [], afflictions: [], permanentEffects: [] },
      inventory: { ordinaryItems: [], heldTrackedItemIds: [] },
      abilities: [],
      relationshipToProtagonist: { stance: "friendly", summary: "同校学生。" },
    },
    present: true,
    ally: false,
    reason: "NPC enters scene during smoke test",
  });

  const publicState = getPublicState();
  assert.equal(result.message, "actor 已写入：tohsaka-rin。");
  assert.equal(publicState.actors["tohsaka-rin"]?.presentation.displayName, "远坂凛");
  assert.ok(publicState.scene.presentActorIds.includes("tohsaka-rin"));
});

void test("upsertActor rejects hidden facts in public registry", () => {
  resetState();

  assert.throws(
    () =>
      upsertActor({
        actor: {
          id: "matou-sakura",
          kind: "human",
          roles: [{ kind: "social", label: "穗群原学园一年级学生" }],
          magecraft: null,
          servantForm: null,
          identity: {
            publicIdentity: "间桐樱",
            background: "士郎所知的温和学妹。",
            lockedFacts: [{ id: "hidden-sakura", text: "樱是 Rider 的真正御主。" }],
          },
          presentation: {
            displayName: "间桐樱",
            apparentAge: "15岁",
            outfit: { label: "穗群原制服", details: "紫发紫瞳，穿女生制服。" },
            demeanor: "安静温柔。",
          },
          condition: { wounds: [], afflictions: [], permanentEffects: [] },
          inventory: { ordinaryItems: [], heldTrackedItemIds: [] },
          abilities: [],
          relationshipToProtagonist: { stance: "friendly", summary: "学妹。" },
        },
        present: false,
        ally: true,
        reason: "Sakura appears in public tracking",
      }),
    /拒绝写入玩家未知幕后秘密/,
  );
});

void test("upsertActor can replace protagonist setup skeleton", () => {
  resetState();

  upsertActor({
    actor: {
      id: "protagonist",
      kind: "human",
      roles: [{ kind: "social", label: "穗群原学园学生" }],
      magecraft: {
        circuits: { count: "27", quality: "E", od: 40, status: "normal", traits: [] },
        disciplines: [
          { name: "强化", rank: "E", notes: "可强化物体结构。" },
          { name: "投影", rank: "E-", notes: "基础投影，稳定性低。" },
        ],
        affiliation: null,
      },
      servantForm: null,
      identity: {
        publicIdentity: "卫宫士郎",
        background: "穗群原学园二年级学生，独居于深山镇卫宫邸。",
        lockedFacts: [{ id: "setup-identity", text: "卫宫士郎" }],
      },
      presentation: {
        displayName: "卫宫士郎",
        apparentAge: "17岁",
        outfit: { label: "穗群原学园制服", details: "冬季制服。" },
        demeanor: "固执且容易主动帮忙。",
      },
      condition: { wounds: [], afflictions: [], permanentEffects: [] },
      inventory: { ordinaryItems: [], heldTrackedItemIds: [] },
      abilities: [
        { id: "reinforcement", label: "强化魔术", summary: "强化物体结构。" },
        { id: "projection", label: "投影魔术", summary: "基础投影。" },
      ],
      relationshipToProtagonist: { stance: "self", summary: "玩家本人。" },
    },
    present: true,
    ally: false,
    reason: "setup confirmed protagonist identity",
  });

  const publicState = getPublicState();
  assert.equal(publicState.actors.protagonist?.identity.publicIdentity, "卫宫士郎");
  assert.match(buildGmBrief(publicState), /玩家角色：卫宫士郎 \/ human \/ 卫宫士郎/);
});
