import type { Static } from "typebox";

import type { TypeBoxValidator } from "../utils/typebox-validation.ts";

import { Type } from "typebox";
import { Compile } from "typebox/compile";

import {
  ACTOR_IMPRESSION_SCHEMA,
  PUBLIC_ACTOR_STATE_SCHEMA,
  RELATIONSHIP_SIGNAL_SCHEMA,
  TRACKED_ITEM_STATE_SCHEMA,
} from "../actor/actor-schema.ts";
import {
  BACKSTAGE_OBLIGATION_SCHEMA,
  BACKSTAGE_PENDING_HARVEST_SCHEMA,
  BACKSTAGE_PRESSURE_STATE_SCHEMA,
  BACKSTAGE_REVIEW_ENTRY_SCHEMA,
  FACTION_CLOCK_SCHEMA,
  OFFSCREEN_EVENT_SCHEMA,
  SCHEDULED_EVENT_SCHEMA,
} from "../backstage/backstage-state-schema.ts";
import { ECONOMY_STATE_SCHEMA } from "../economy/economy-schema.ts";
import { HOOK_STATE_SCHEMA } from "../memory/hook-schema.ts";
import { CAMPAIGN_MEMORY_SCHEMA } from "../memory/memory-schema.ts";
import { SCENE_STATE_SCHEMA } from "../scene/scene-schema.ts";
import {
  SECRET_ACTOR_STATE_SCHEMA,
  SECRET_CAMPAIGN_FACT_SCHEMA,
  SECRET_EVENT_MEMORY_SCHEMA,
} from "../secrets/secrets-schema.ts";
import { LOCATION_STATE_SCHEMA } from "../turn/turn-time-schema.ts";
import { normalizeIsoInstant } from "../utils/date-time.ts";
import { isRecord, parseTypeBoxValue, trimStringsDeep } from "../utils/typebox-validation.ts";
import {
  ISO_INSTANT_SCHEMA,
  NON_EMPTY_STRING_ARRAY_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  NON_NEGATIVE_INTEGER_SCHEMA,
  nullable,
} from "./schema-primitives.ts";
import {
  OPENING_MODE_SCHEMA,
  RULE_SET_ID_SCHEMA,
  stringEnumSchema,
  TIMELINE_ID_SCHEMA,
  TIMEZONE_ID_SCHEMA,
} from "./state-enum-schemas.ts";

/**
 * State 反序列化边界 schema 的组合根：领域状态片段住在各自领域的
 * *-schema.ts（actor / scene / economy / knowledge / backstage），本文件只保留
 * 状态机骨架自己的 schema（meta / campaign / clock / turnLog / obligations）
 * 并拼装出 STATE_SCHEMA。结构与字段约束由 TypeBox 校验；ISO 时间归一化与
 * 跨字段引用（actor 引用、registry key 一致性等）由 parseStateSchema 的
 * 后置 pass 处理——schema 表达不了的不变量集中在那里。
 *
 * schema 是唯一事实源：state.ts 的骨架类型从这里 Static 派生，
 * 不存在第二份手写形状，也就不再需要双向赋值漂移检查。
 */

export const STATE_META_SCHEMA = Type.Object({
  schemaVersion: Type.Literal(19),
  createdAt: ISO_INSTANT_SCHEMA,
  updatedAt: ISO_INSTANT_SCHEMA,
  /** Seeded RNG seed（backlog #9）：确定性随机源，初始化时生成 */
  rngSeed: Type.Number(),
  /** Seeded RNG counter：每次消耗 +1，rewind 后重放行为一致 */
  rngCounter: Type.Integer({ minimum: 0 }),
});

export const CAMPAIGN_STATE_SCHEMA = Type.Object({
  title: NON_EMPTY_STRING_SCHEMA,
  timeline: TIMELINE_ID_SCHEMA,
  openingMode: OPENING_MODE_SCHEMA,
  premise: NON_EMPTY_STRING_SCHEMA,
  activeRuleSetIds: Type.Array(RULE_SET_ID_SCHEMA),
});

export const CLOCK_STATE_SCHEMA = Type.Object({
  startedAt: ISO_INSTANT_SCHEMA,
  currentAt: ISO_INSTANT_SCHEMA,
  timezone: TIMEZONE_ID_SCHEMA,
  lastLongRestAt: nullable(ISO_INSTANT_SCHEMA),
});

/** turnLog 里的 time 与 parseTurnTimePolicySchema 保持同等约束（elapsedMinutes > 0）。 */
export const TURN_TIME_POLICY_STATE_SCHEMA = Type.Union([
  Type.Object({
    kind: Type.Literal("elapsed"),
    elapsedMinutes: Type.Integer({ minimum: 1 }),
    reason: NON_EMPTY_STRING_SCHEMA,
  }),
  Type.Object({
    kind: Type.Literal("travel"),
    location: LOCATION_STATE_SCHEMA,
    elapsedMinutes: Type.Integer({ minimum: 1 }),
    reason: NON_EMPTY_STRING_SCHEMA,
  }),
]);

export const TURN_LOG_ENTRY_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  summary: NON_EMPTY_STRING_SCHEMA,
  startedAt: ISO_INSTANT_SCHEMA,
  endedAt: ISO_INSTANT_SCHEMA,
  time: TURN_TIME_POLICY_STATE_SCHEMA,
  eventCount: NON_NEGATIVE_INTEGER_SCHEMA,
  resultCount: NON_NEGATIVE_INTEGER_SCHEMA,
});

export const TURN_OBLIGATION_KINDS = [
  "scene-objective",
  "scene-threat",
  "actor-condition",
  "servant-form",
  "memory",
  "reveal-secret",
] as const;

export const TURN_OBLIGATION_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  /** 产生此义务的裁决源，如 "combat-exchange" */
  source: NON_EMPTY_STRING_SCHEMA,
  kind: stringEnumSchema(TURN_OBLIGATION_KINDS),
  summary: NON_EMPTY_STRING_SCHEMA,
  createdAt: ISO_INSTANT_SCHEMA,
});

export const PUBLIC_GAME_STATE_SCHEMA = Type.Object({
  campaign: CAMPAIGN_STATE_SCHEMA,
  clock: CLOCK_STATE_SCHEMA,
  scene: SCENE_STATE_SCHEMA,
  actors: Type.Record(Type.String(), PUBLIC_ACTOR_STATE_SCHEMA),
  trackedItems: Type.Record(Type.String(), TRACKED_ITEM_STATE_SCHEMA),
  protagonistActorId: NON_EMPTY_STRING_SCHEMA,
  allyActorIds: NON_EMPTY_STRING_ARRAY_SCHEMA,
  economy: ECONOMY_STATE_SCHEMA,
  memory: CAMPAIGN_MEMORY_SCHEMA,
  turnLog: Type.Array(TURN_LOG_ENTRY_SCHEMA),
  /** 裁决已出、尚未落地的强制状态变更；canonical commit 前必须清空 */
  obligations: Type.Array(TURN_OBLIGATION_SCHEMA),
  /** Mystery hook 账本：hook budget 从 prompt 自觉变成领域对象（backlog #2） */
  hooks: Type.Array(HOOK_STATE_SCHEMA),
  /** 玩家已知的关系信号证据链；只记录行为证据，不写隐藏内心判词 */
  relationshipSignals: Type.Array(RELATIONSHIP_SIGNAL_SCHEMA),
  /** NPC 印象卡：voice/posture/texture 蒸馏快照，presence 驱动注入；按 actorId 聚合 */
  actorImpressions: Type.Record(Type.String(), ACTOR_IMPRESSION_SCHEMA),
});

export const SECRET_GAME_STATE_SCHEMA = Type.Object({
  /**
   * GM 对每个 actor 的隐藏内部模型，按 actorId 聚合。
   * 三个 facet（secrets / agenda / knowledgeLens）同生死、同过 removeActorEverywhere 级联。
   * 未来新增的 per-actor 秘密状态应作为 SecretActorState 的新字段，而非新的顶层侧表。
   */
  actorStates: Type.Record(Type.String(), SECRET_ACTOR_STATE_SCHEMA),
  campaignSecrets: Type.Array(SECRET_CAMPAIGN_FACT_SCHEMA),
  secretEventLog: Type.Array(SECRET_EVENT_MEMORY_SCHEMA),
  offscreenEventLog: Type.Array(OFFSCREEN_EVENT_SCHEMA),
  /** BITD 式阵营进度钟：世界不为玩家暂停的机械载体 */
  factionClocks: Type.Array(FACTION_CLOCK_SCHEMA),
  /** 到期义务：越过 dueAt 后 canonical commit 会在返回值里催账 */
  scheduledEvents: Type.Array(SCHEDULED_EVENT_SCHEMA),
  /** 玩家未确认的关系信号与误判，只给 GM/private resolve/subagent 使用 */
  relationshipSignals: Type.Array(RELATIONSHIP_SIGNAL_SCHEMA),
  /**
   * 后台世界推进义务账本（backlog #5 runtime 闭环）：触发器命中时生成，
   * 下一 canonical turn 前必须清账（延迟硬阻断）。与 public obligations 独立。
   */
  backstageObligations: Type.Array(BACKSTAGE_OBLIGATION_SCHEMA),
  /** 后台义务的审查记录：candidate 落地 / no-change / blocked 都在此留痕，不污染 public */
  backstageReviewLog: Type.Array(BACKSTAGE_REVIEW_ENTRY_SCHEMA),
  /** 后台压力计数：跨回合的连续无代价计数器 */
  backstagePressure: BACKSTAGE_PRESSURE_STATE_SCHEMA,
  /**
   * 待 harvest 的后台 director run（run_parallel_line 启动后立即记录，harvest 后清除）。
   * 引擎据此在 canonical commit 催账，并让 resolve_backstage_line 在有未 harvest run 时
   * 拒绝清账——防止已产出的候选被一句 no-change 静默丢弃。
   */
  backstagePendingHarvests: Type.Array(BACKSTAGE_PENDING_HARVEST_SCHEMA),
});

export const STATE_SCHEMA = Type.Object({
  meta: STATE_META_SCHEMA,
  public: PUBLIC_GAME_STATE_SCHEMA,
  secrets: SECRET_GAME_STATE_SCHEMA,
});

/** 与 state.ts 导出的 GameState 同源（都是 Static<typeof STATE_SCHEMA>）。 */
type State = Static<typeof STATE_SCHEMA>;

// Compile 必须在独立常量上调用：带注解的上下文类型会干扰泛型推导，把 Validator 退化成 unknown。
const COMPILED_STATE_VALIDATOR = Compile(STATE_SCHEMA);
const STATE_VALIDATOR: TypeBoxValidator<State> = COMPILED_STATE_VALIDATOR;

export function parseStateSchema(value: unknown): State {
  const prepared = applyDeserializationDefaults(trimStringsDeep(value));
  const state = parseTypeBoxValue<State>(prepared, "state", STATE_VALIDATOR);
  normalizeStateDatesInPlace(state);
  assertStateInvariants(state);
  return state;
}

/** 旧档兼容：secrets.offscreenEventLog 缺失时按空数组处理。 */
function applyDeserializationDefaults(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const secrets = value["secrets"];
  if (isRecord(secrets) && secrets["offscreenEventLog"] === undefined) {
    secrets["offscreenEventLog"] = [];
  }
  return value;
}

/** ISO 时间字段统一走 normalizeIsoInstant：校验格式并归一化为 canonical 形式。 */
function normalizeStateDatesInPlace(state: State): void {
  state.meta.createdAt = normalizeIsoInstant(state.meta.createdAt, "meta.createdAt");
  state.meta.updatedAt = normalizeIsoInstant(state.meta.updatedAt, "meta.updatedAt");

  const clock = state.public.clock;
  clock.startedAt = normalizeIsoInstant(clock.startedAt, "clock.startedAt");
  clock.currentAt = normalizeIsoInstant(clock.currentAt, "clock.currentAt");
  if (clock.lastLongRestAt !== null) {
    clock.lastLongRestAt = normalizeIsoInstant(clock.lastLongRestAt, "clock.lastLongRestAt");
  }

  state.public.scene.lastResolvedAt = normalizeIsoInstant(
    state.public.scene.lastResolvedAt,
    "scene.lastResolvedAt",
  );

  for (const [index, entry] of state.public.turnLog.entries()) {
    entry.startedAt = normalizeIsoInstant(entry.startedAt, `turnLog[${index}].startedAt`);
    entry.endedAt = normalizeIsoInstant(entry.endedAt, `turnLog[${index}].endedAt`);
  }

  for (const actor of Object.values(state.public.actors)) {
    if (actor.servantForm === null) {
      continue;
    }
    for (const modifier of actor.servantForm.parameters.modifiers) {
      if (modifier.expiresAt !== null) {
        modifier.expiresAt = normalizeIsoInstant(modifier.expiresAt, "modifier.expiresAt");
      }
    }
  }

  const memory = state.public.memory;
  for (const fact of memory.pinnedFacts) {
    fact.since = normalizeIsoInstant(fact.since, "memoryFact.since");
  }
  for (const event of memory.eventLog) {
    event.time = normalizeIsoInstant(event.time, "majorEvent.time");
  }
  for (const dailyEvent of memory.dailyEvents) {
    dailyEvent.time = normalizeIsoInstant(dailyEvent.time, "dailyEvent.time");
  }
  for (const dailySummary of memory.dailySummaries) {
    dailySummary.startDate = normalizeIsoInstant(dailySummary.startDate, "dailySummary.startDate");
    dailySummary.endDate = normalizeIsoInstant(dailySummary.endDate, "dailySummary.endDate");
  }

  for (const event of state.secrets.secretEventLog) {
    event.time = normalizeIsoInstant(event.time, "secretEvent.time");
  }
  for (const event of state.secrets.offscreenEventLog) {
    event.timeRange.start = normalizeIsoInstant(
      event.timeRange.start,
      "offscreenEvent.timeRange.start",
    );
    event.timeRange.end = normalizeIsoInstant(event.timeRange.end, "offscreenEvent.timeRange.end");
  }

  for (const bundle of Object.values(state.secrets.actorStates)) {
    const agenda = bundle.agenda;
    if (agenda !== undefined && agenda.lastIndependentActionAt !== null) {
      agenda.lastIndependentActionAt = normalizeIsoInstant(
        agenda.lastIndependentActionAt,
        "actorAgenda.lastIndependentActionAt",
      );
    }
  }
}

type ActorRegistry = State["public"]["actors"];

/** schema 表达不了的跨字段不变量：registry key 一致性与 actor 引用完整性。 */
function assertStateInvariants(state: State): void {
  const actors = state.public.actors;
  assertActorRegistryInvariants(actors);
  assertSceneActorReferences(state, actors);
  assertTrackedItemInvariants(state, actors);
  assertEconomyActorReferences(state, actors);
  assertSecretActorStateInvariants(state, actors);
  assertRelationshipSignalInvariants(state, actors);
  assertActorImpressionInvariants(state, actors);
  assertFactionClockInvariants(state);
}

function assertFactionClockInvariants(state: State): void {
  for (const clock of state.secrets.factionClocks) {
    if (clock.filled > clock.size) {
      throw new Error(
        `非法 faction clock ${clock.id}: filled(${clock.filled}) 不能大于 size(${clock.size})。`,
      );
    }
  }
}

function assertActorRegistryInvariants(actors: ActorRegistry): void {
  for (const [actorId, actor] of Object.entries(actors)) {
    if (actor.id !== actorId) {
      throw new Error(`actor registry key ${actorId} 与 actor.id ${actor.id} 不一致。`);
    }
    for (const role of actor.roles) {
      if (role.kind === "master") {
        if (role.commandSpells.remaining > role.commandSpells.total) {
          throw new Error("非法 commandSpells: remaining 不能大于 total。");
        }
        for (const servantId of role.contractedServantIds) {
          assertActorExists(servantId, actors, `actors.${actorId} contractedServantIds[]`);
        }
      }
    }
    const masterActorId = actor.servantForm?.contract.masterActorId ?? null;
    if (masterActorId !== null) {
      assertActorExists(
        masterActorId,
        actors,
        `actors.${actorId} servantForm.contract.masterActorId`,
      );
    }
  }
}

function assertSceneActorReferences(state: State, actors: ActorRegistry): void {
  assertActorExists(state.public.protagonistActorId, actors, "protagonistActorId");
  for (const actorId of state.public.allyActorIds) {
    assertActorExists(actorId, actors, "allyActorIds[]");
  }
  for (const actorId of state.public.scene.presentActorIds) {
    assertActorExists(actorId, actors, "scene.presentActorIds[]");
  }
}

function assertTrackedItemInvariants(state: State, actors: ActorRegistry): void {
  for (const [itemId, item] of Object.entries(state.public.trackedItems)) {
    if (item.id !== itemId) {
      throw new Error(`trackedItems key ${itemId} 与 item.id ${item.id} 不一致。`);
    }
    if (item.ownerActorId !== null) {
      assertActorExists(item.ownerActorId, actors, "item.ownerActorId");
    }
    if (item.holderActorId !== null) {
      assertActorExists(item.holderActorId, actors, "item.holderActorId");
    }
  }
}

function assertEconomyActorReferences(state: State, actors: ActorRegistry): void {
  for (const purse of state.public.economy.accessibleFunds) {
    assertActorExists(purse.ownerActorId, actors, "purse.ownerActorId");
  }
  for (const debt of state.public.economy.debts) {
    assertActorExists(debt.debtorActorId, actors, "debt.debtorActorId");
  }
}

function assertSecretActorStateInvariants(state: State, actors: ActorRegistry): void {
  for (const [actorId, bundle] of Object.entries(state.secrets.actorStates)) {
    if (bundle.actorId !== actorId) {
      throw new Error(`actorStates key ${actorId} 与 actorId ${bundle.actorId} 不一致。`);
    }
    assertActorExists(actorId, actors, "actorStates key");
    if (bundle.secrets !== undefined && bundle.secrets.actorId !== actorId) {
      throw new Error(
        `actorStates.${actorId}.secrets.actorId ${bundle.secrets.actorId} 与 key 不一致。`,
      );
    }
    if (bundle.agenda !== undefined && bundle.agenda.actorId !== actorId) {
      throw new Error(
        `actorStates.${actorId}.agenda.actorId ${bundle.agenda.actorId} 与 key 不一致。`,
      );
    }
    if (bundle.knowledgeLens !== undefined && bundle.knowledgeLens.actorId !== actorId) {
      throw new Error(
        `actorStates.${actorId}.knowledgeLens.actorId ${bundle.knowledgeLens.actorId} 与 key 不一致。`,
      );
    }
  }
}

function assertRelationshipSignalInvariants(state: State, actors: ActorRegistry): void {
  const seen = new Set<string>();
  for (const signal of state.public.relationshipSignals) {
    assertRelationshipSignalReferences(signal, actors, "public.relationshipSignals[]");
    if (signal.visibility !== "player-known") {
      throw new Error(`public.relationshipSignals 只能包含 player-known 信号: ${signal.id}。`);
    }
    assertUniqueRelationshipSignalId(signal.id, seen);
  }
  for (const signal of state.secrets.relationshipSignals) {
    assertRelationshipSignalReferences(signal, actors, "secrets.relationshipSignals[]");
    if (signal.visibility !== "secret") {
      throw new Error(`secrets.relationshipSignals 只能包含 secret 信号: ${signal.id}。`);
    }
    assertUniqueRelationshipSignalId(signal.id, seen);
  }
}

function assertRelationshipSignalReferences(
  signal: State["public"]["relationshipSignals"][number],
  actors: ActorRegistry,
  fieldName: string,
): void {
  assertActorExists(signal.actorId, actors, `${fieldName}.actorId`);
  assertActorExists(signal.targetActorId, actors, `${fieldName}.targetActorId`);
}

function assertUniqueRelationshipSignalId(id: string, seen: Set<string>): void {
  if (seen.has(id)) {
    throw new Error(`重复 relationship signal id: ${id}。`);
  }
  seen.add(id);
}

function assertActorImpressionInvariants(state: State, actors: ActorRegistry): void {
  for (const [actorId, impression] of Object.entries(state.public.actorImpressions)) {
    if (impression.actorId !== actorId) {
      throw new Error(`actorImpressions key ${actorId} 与 actorId ${impression.actorId} 不一致。`);
    }
    assertActorExists(actorId, actors, "actorImpressions key");
  }
}

function assertActorExists(actorId: string, actors: ActorRegistry, fieldName: string): void {
  if (actors[actorId] === undefined) {
    throw new Error(`非法${fieldName}: actor ${actorId} 不存在。`);
  }
}
