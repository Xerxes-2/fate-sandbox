import type { FateParams, PublicActorState } from "../engine/core/state/state.ts";

import assert from "node:assert/strict";
import test from "node:test";

import { buildGmBrief } from "../engine/core/state/public-projection.ts";
import { cloneState, commitState, getState, resetState } from "../engine/core/state/state-store.ts";
import { commitTurnTool } from "../tools/settlement/commit-turn.ts";
import { initializeNewGameTool } from "../tools/settlement/initialize-new-game.ts";
import { manageFactionClockTool } from "../tools/settlement/manage-faction-clock.ts";
import { recallMemoryTool } from "../tools/settlement/recall-memory.ts";
import { recordActorKnowledgeTool } from "../tools/settlement/record-actor-knowledge.ts";
import { recordOffscreenEventTool } from "../tools/settlement/record-offscreen-event.ts";
import { recordRelationshipSignalTool } from "../tools/settlement/record-relationship-signal.ts";
import { resolveCombatExchangeTool } from "../tools/settlement/resolve-combat-exchange.ts";
import { revealSecretTool } from "../tools/settlement/reveal-secret.ts";
import { setScenePresenceTool } from "../tools/settlement/set-scene-presence.ts";
import { updateActorAgendaTool } from "../tools/settlement/update-actor-agenda.ts";
import { updateHookTool } from "../tools/settlement/update-hook.ts";
import { upsertActorTool } from "../tools/settlement/upsert-actor.ts";

/**
 * 引擎集成走查（回流自 lonestar engine-integration 模式；确定性，不调真 LLM）——
 * 注意：这不是 playtest。
 *
 * 本文件只验证引擎完整流程：工具层（唯一写入通道）接收合法输入后，跨领域账本
 * 是否协同落账——开局 → 场景/beat → 混合领域 commit → 记忆三层 → 战斗 →
 * backstage 义务处理 → 悬念/时钟/NPC 主动性 → 秘密防漏 → beat 收口。
 * 模块级单测各自验证单域行为；本走查抓的是跨域回归（migration/invariant/
 * obligation 联动炸了而单域测试全绿的那类）。
 *
 * 真正的 playtest 是交互式、调真 LLM、多轮的（./start.sh -p / --continue），
 * 验证 prompt→行为→工具调用→两 pass 渲染→压缩。那一层本文件抹不到。
 */
void test("full Fate slice runs end to end through the tool layer", () => {
  resetState();
  const session = noopSessionManager();

  // ---- 开局：普通人 protagonist + 战役预设 ----
  initializeNewGameTool(
    {
      kind: "human-protagonist",
      campaign: { presetId: "fsn_2004_fuyuki" },
      protagonist: {
        internalName: "走查主角",
        publicIdentity: "不了解魔术的本地学生",
        background: "普通日常被异常打断。",
        apparentAge: "高中生",
        outfit: { label: "日常服装", details: "便于行动的普通衣物。" },
        demeanor: "谨慎而困惑。",
        ordinaryItems: ["手机", "学生证"],
      },
      presence: { presentActorIds: ["protagonist"] },
      reason: "集成走查开局",
    },
    session,
  );
  assert.ok(getState().public.actors["protagonist"]);

  // ---- 场景：NPC skeleton + 在场 ----
  upsertActorTool(
    {
      kind: "ensure-public-npc",
      npc: {
        actorId: "tohsaka-rin",
        internalName: "远坂凛",
        publicIdentity: "穗群原学园学生，同行调查的魔术师。",
      },
      reason: "集成走查引入 NPC",
    },
    session,
  );
  setScenePresenceTool(
    { presentActorIds: ["protagonist", "tohsaka-rin"], allyActorIds: [], reason: "凛加入调查" },
    session,
  );
  assert.ok(getState().public.scene.presentActorIds.includes("tohsaka-rin"));

  // ---- beat 开启（commit_turn 的 begin-beat 子事件） ----
  commitTurnTool(
    {
      summary: "夜巡开始。",
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "开启走查 beat。" },
      events: [
        {
          kind: "scene",
          event: {
            kind: "begin-beat",
            title: "商店街夜巡",
            purpose: "查明结界异常来源",
            objectives: ["找到结界节点"],
          },
        },
      ],
    },
    session,
  );
  assert.equal(getState().public.scene.storyWindow?.title, "商店街夜巡");

  // ---- 混合领域 commit：伤势 + 经济 + 威胁 + 记忆三层 ----
  commitTurnTool(
    {
      summary: "巡查受挫，采买绷带。",
      time: { kind: "elapsed", elapsedMinutes: 10, reason: "巡查与采买。" },
      events: [
        {
          kind: "actor-condition",
          event: {
            kind: "add-wound",
            actorId: "protagonist",
            severity: "minor",
            text: "翻墙时擦伤左掌。",
            source: "夜巡翻墙",
            recoverable: true,
          },
        },
        {
          kind: "economy",
          event: {
            kind: "spend-money",
            purseId: "purse-protagonist-cash",
            amount: 800,
            reason: "便利店买绷带和饮料。",
          },
        },
        {
          kind: "scene",
          event: {
            kind: "add-threat",
            summary: "结界内侧传来令人不安的低鸣。",
            severity: "medium",
          },
        },
        {
          kind: "memory",
          event: {
            kind: "record-daily-event",
            eventKind: "shopping",
            title: "便利店采买",
            summary: "买了绷带和两瓶热饮。",
          },
        },
        {
          kind: "memory",
          event: {
            kind: "pin-fact",
            scope: "world",
            subject: "商店街结界",
            text: "商店街东口的结界夜间密度更高。",
          },
        },
        {
          kind: "memory",
          event: {
            kind: "record-major-event",
            title: "确认结界异常",
            summary: "巡查确认商店街结界被人为改造。",
            consequences: ["需要向教会求证监督者的立场。"],
            claims: [
              { kind: "mundane", statement: "商店街结界被人为改造。", certainty: "confirmed" },
            ],
          },
        },
      ],
    },
    session,
  );
  const afterMixed = getState();
  assert.equal(afterMixed.public.actors["protagonist"]?.condition.wounds.length, 1);
  assert.equal(afterMixed.public.memory.dailyEvents.length, 1);
  assert.equal(afterMixed.public.memory.eventLog.length >= 1, true);

  // ---- 记忆检索：三层都能召回 ----
  const recall = textOf(recallMemoryTool({ keywords: ["结界"] }, session));
  assert.match(recall, /确认结界异常/);
  assert.match(recall, /商店街东口/);

  // ---- 战斗：从者交锋（确定性裁决文本 + 落点义务自动登账） ----
  insertServant("saber", "Saber", "B");
  insertServant("caster", "Caster", "A");
  const combat = textOf(
    resolveCombatExchangeTool(
      {
        actorId: "saber",
        opponentId: "caster",
        intent: "护住御主从术式火线中撤出",
        tactic: "protect",
        actorParameter: "agility",
        opponentParameter: "mana",
        targetObjective: "护住御主撤离",
        committedResources: ["Saber 主动承受术式余波"],
        knownAdvantages: ["撤离目标明确"],
        knownDisadvantages: ["Caster 处于阵地内"],
        riskTolerance: "high",
      },
      session,
    ),
  );
  assert.match(combat, /交锋裁决：/u);
  // 交锋走 seeded RNG，落点义务组合随裁决变化（四类之内）；同一次 commit_turn 的
  // 领域事件可自清（FIFO 对账），四类全覆盖：多余事件无义务时正常落账。
  assert.equal(getState().public.obligations.length > 0, true);
  commitTurnTool(
    {
      summary: "交锋落点结算。",
      time: { kind: "elapsed", elapsedMinutes: 1, reason: "交锋后整备。" },
      events: [
        {
          kind: "scene",
          event: { kind: "add-objective", summary: "掩护御主撤离后重新集结" },
        },
        {
          kind: "scene",
          event: {
            kind: "add-threat",
            summary: "Caster 阵地术式仍在锁定撤离路线。",
            severity: "high",
          },
        },
        {
          kind: "servant-form",
          event: {
            kind: "spend-mana",
            actorId: "saber",
            amount: 20,
            reason: "硬承术式余波掩护撤离。",
          },
        },
        {
          kind: "actor-condition",
          event: {
            kind: "add-wound",
            actorId: "protagonist",
            severity: "minor",
            text: "撤离时被术式余波灼伤小臂。",
            source: "术式余波",
            recoverable: true,
          },
        },
      ],
    },
    session,
  );
  assert.equal(getState().public.obligations.length, 0);

  // ---- backstage 义务流程：大时间推进 → 义务 → 阻塞 → offscreen 处理 ----
  commitTurnTool(
    {
      summary: "守夜数小时。",
      time: { kind: "elapsed", elapsedMinutes: 45, reason: "守夜到深夜。" },
      events: [],
    },
    session,
  );
  assert.equal(getState().secrets.backstageObligations.length > 0, true);
  assert.throws(
    () =>
      commitTurnTool(
        {
          summary: "义务未清就推进。",
          time: { kind: "elapsed", elapsedMinutes: 1, reason: "应被拒绝。" },
          events: [],
        },
        session,
      ),
    /backstage/i,
  );
  const now = getState().public.clock.currentAt;
  recordOffscreenEventTool(
    {
      lineId: "caster-line",
      actorIds: ["caster"],
      timeRange: { start: now, end: now },
      visibility: "foreshadowed",
      summary: "Caster 在柳洞寺方向加固结界。",
      consequences: ["靠近山门的侦察难度提高。"],
      futureHooks: ["夜间靠近柳洞寺会先遇到结界痕迹。"],
      createdFrom: "parallel-line-subagent",
      pressureType: "servant-autonomy",
    },
    session,
  );
  assert.equal(getState().secrets.backstageObligations.length, 0);

  // ---- 悬念账本 + 阵营时钟 ----
  const hookText = textOf(updateHookTool({ kind: "open", label: "监督者的私心" }, session));
  const hookId = /hook-[\w-]+/u.exec(hookText)?.[0];
  assert.ok(hookId, `无法从 update_hook 输出提取 hookId：${hookText}`);
  updateHookTool({ kind: "surface", hookId, novelty: "言峰深夜出现在商店街尽头。" }, session);
  manageFactionClockTool(
    {
      kind: "upsert-clock",
      factionId: "caster-line",
      label: "大结界完成度",
      size: 4,
      visibility: "hidden",
    },
    session,
  );
  const clockId = getState().secrets.factionClocks[0]?.id;
  assert.ok(clockId);
  manageFactionClockTool(
    { kind: "advance-clock", clockId, ticks: 1, reason: "柳洞寺结界加固。" },
    session,
  );
  assert.equal(getState().secrets.factionClocks[0]?.filled, 1);

  // ---- NPC 主动性 / 认知边界 / 关系信号 ----
  updateActorAgendaTool(
    {
      kind: "upsert",
      actorId: "tohsaka-rin",
      goal: "抢先查明结界改造者",
      fear: "被教会先手压制",
      currentOrder: "今晚盯住商店街东口",
    },
    session,
  );
  recordActorKnowledgeTool(
    {
      kind: "add-fact",
      actorId: "tohsaka-rin",
      category: "suspects",
      fact: "教会方面有人插手结界",
    },
    session,
  );
  recordRelationshipSignalTool(
    {
      actorId: "tohsaka-rin",
      targetActorId: "protagonist",
      signal: "解释术式时不自觉放慢了语速",
      interpretation: "把同行者当成了需要照顾的搭档",
      boundary: "仍然拒绝透露家族目标",
      visibility: "player-known",
    },
    session,
  );
  assert.equal(getState().secrets.actorStates["tohsaka-rin"]?.agenda?.goal, "抢先查明结界改造者");
  assert.ok(getState().secrets.actorStates["tohsaka-rin"]?.knowledgeLens);

  // ---- 秘密：配置 + 不充分证据的 claim（拒绝且不泄漏） ----
  revealSecretTool(
    {
      kind: "configure-actor-secrets",
      actorId: "tohsaka-rin",
      privateMotives: [{ value: "家族遗训要求独占圣杯情报。", revealConditions: ["圣杯", "遗训"] }],
      reason: "集成走查配置秘密",
    },
    session,
  );
  const reveal = textOf(
    revealSecretTool(
      {
        kind: "claim-reveal",
        actorId: "tohsaka-rin",
        claim: "家族遗训要求独占圣杯情报。",
        evidence: "只是直觉，她话里有所保留。",
      },
      session,
    ),
  );
  assert.doesNotMatch(reveal, /遗训要求独占/);
  assert.equal(JSON.stringify(getState().public).includes("家族遗训要求独占圣杯情报"), false);

  // ---- beat 收口（complete-beat + nextBeat）+ 终局一致性 ----
  commitTurnTool(
    {
      summary: "夜巡收口。",
      time: { kind: "elapsed", elapsedMinutes: 5, reason: "撤回据点。" },
      events: [
        {
          kind: "scene",
          event: {
            kind: "complete-beat",
            outcome: "确认结界为人为改造，凛承诺共享部分情报。",
            memory: {
              title: "商店街夜巡收官",
              summary: "确认结界异常并与凛达成临时同盟。",
              claims: [
                { kind: "mundane", statement: "与凛达成临时情报同盟。", certainty: "confirmed" },
              ],
            },
            nextBeat: { title: "返回据点整备", objectives: ["处理伤口并整理线索"] },
          },
        },
      ],
    },
    session,
  );
  assert.equal(getState().public.scene.storyWindow?.title, "返回据点整备");
  // beat-complete 本身是 backstage 触发器：收口后应新增一条义务，再完成一次处理流程。
  assert.equal(getState().secrets.backstageObligations.length, 1);
  const later = getState().public.clock.currentAt;
  recordOffscreenEventTool(
    {
      lineId: "church-line",
      actorIds: ["tohsaka-rin"],
      timeRange: { start: later, end: later },
      visibility: "secret",
      summary: "教会方面开始排查夜间目击记录。",
      consequences: ["监督者提前注意到主角一行。"],
      futureHooks: ["下次接触教会时态度微妙。"],
      createdFrom: "parallel-line-subagent",
      pressureType: "faction-maneuver",
    },
    session,
  );
  const final = getState();
  assert.equal(final.public.obligations.length, 0);
  assert.equal(final.secrets.backstageObligations.length, 0);
  // GM brief 全量投影可构建，且不携带任何未揭示秘密字符串。
  const brief = buildGmBrief(final.public);
  assert.equal(brief.includes("家族遗训要求独占圣杯情报"), false);
  assert.ok(brief.length > 0);
});

function insertServant(id: string, internalName: string, rank: FateParams["strength"]): void {
  const draft = cloneState();
  draft.public.actors[id] = servantActor(id, internalName, params(rank));
  commitState(draft);
}

function servantActor(id: string, internalName: string, parameters: FateParams): PublicActorState {
  return {
    id,
    kind: "spirit",
    origin: "测试英灵",
    roles: [],
    magecraft: null,
    servantForm: {
      identity: {
        className: "Saber",
        trueName: { status: "hidden", display: "Saber" },
        locked: true,
      },
      condition: {
        spiritualCore: { value: 100 },
        mana: { value: 100 },
        spiritualCondition: "完好",
        permanentDefects: [],
      },
      contract: {
        masterActorId: null,
        masterName: null,
        status: "masterless",
        manaSupply: "sufficient",
      },
      parameters: { base: parameters, modifiers: [], baseLocked: true },
      skills: { classSkills: [], personalSkills: [] },
      noblePhantasms: [],
      currentOrder: "测试交锋",
    },
    identity: { publicIdentity: internalName, background: "测试 actor", lockedFacts: [] },
    presentation: {
      internalName,
      renderName: internalName,
      apparentAge: "未知",
      outfit: { label: "测试服装", details: "测试用。" },
      demeanor: "测试状态",
    },
    condition: { wounds: [], afflictions: [], permanentEffects: [] },
    inventory: { ordinaryItems: [] },
    abilities: [],
    relationshipToProtagonist: { stance: "neutral", summary: "测试关系。" },
  };
}

function params(rank: FateParams["strength"]): FateParams {
  return {
    strength: rank,
    endurance: rank,
    agility: rank,
    mana: rank,
    luck: rank,
    noblePhantasm: rank,
  };
}

function noopSessionManager(): unknown {
  return { appendCustomEntry: () => "entry-test" };
}

function textOf(result: { content: Array<{ text: string }> }): string {
  return result.content.map((part) => part.text).join("\n");
}
