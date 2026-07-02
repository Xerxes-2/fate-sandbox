import type { Static } from "typebox";

import { Type } from "typebox";

import {
  ISO_INSTANT_SCHEMA,
  NON_EMPTY_STRING_ARRAY_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  NON_NEGATIVE_INTEGER_SCHEMA,
  nullable,
} from "../state/schema-primitives.ts";
import {
  OFFSCREEN_EVENT_SOURCE_SCHEMA,
  OFFSCREEN_EVENT_VISIBILITY_SCHEMA,
  stringEnumSchema,
} from "../state/state-enum-schemas.ts";

/**
 * Backstage 状态树 schema（自 state-schema.ts 分拆而来）：
 * offscreen 事件账本、阵营时钟、到期事件、义务/复盘/压力/待收割。
 * 状态类型在 backstage-state.ts 从这里派生，schema 是唯一事实源。
 */

export const OFFSCREEN_EVENT_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  lineId: NON_EMPTY_STRING_SCHEMA,
  actorIds: NON_EMPTY_STRING_ARRAY_SCHEMA,
  timeRange: Type.Object({ start: ISO_INSTANT_SCHEMA, end: ISO_INSTANT_SCHEMA }),
  visibility: OFFSCREEN_EVENT_VISIBILITY_SCHEMA,
  summary: NON_EMPTY_STRING_SCHEMA,
  consequences: NON_EMPTY_STRING_ARRAY_SCHEMA,
  futureHooks: NON_EMPTY_STRING_ARRAY_SCHEMA,
  createdFrom: OFFSCREEN_EVENT_SOURCE_SCHEMA,
  pressureType: NON_EMPTY_STRING_SCHEMA,
  pressureSlotId: nullable(NON_EMPTY_STRING_SCHEMA),
});

export const FACTION_CLOCK_VISIBILITIES = ["hidden", "leaked"] as const;

export const FACTION_CLOCK_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  factionId: NON_EMPTY_STRING_SCHEMA,
  label: NON_EMPTY_STRING_SCHEMA,
  filled: NON_NEGATIVE_INTEGER_SCHEMA,
  size: Type.Integer({ minimum: 2, maximum: 12 }),
  visibility: stringEnumSchema(FACTION_CLOCK_VISIBILITIES),
});

export const SCHEDULED_EVENT_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  dueAt: ISO_INSTANT_SCHEMA,
  summary: NON_EMPTY_STRING_SCHEMA,
});

/** 生成后台义务的触发源（v1 可检测核心集） */
export const BACKSTAGE_TRIGGERS = ["time-advance", "beat-complete", "no-cost-streak"] as const;

export type BackstageTrigger = (typeof BACKSTAGE_TRIGGERS)[number];

export const BACKSTAGE_OBLIGATION_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  trigger: stringEnumSchema(BACKSTAGE_TRIGGERS),
  summary: NON_EMPTY_STRING_SCHEMA,
  createdAt: ISO_INSTANT_SCHEMA,
});

export const BACKSTAGE_PENDING_HARVEST_SCHEMA = Type.Object({
  runId: NON_EMPTY_STRING_SCHEMA,
  lineId: NON_EMPTY_STRING_SCHEMA,
  spawnedAt: ISO_INSTANT_SCHEMA,
});

/** 后台义务的清账结果：landed=落地候选；no-change/blocked=经审查的显式无推进 */
export const BACKSTAGE_RESOLUTION_OUTCOMES = ["landed", "no-change", "blocked"] as const;

export type BackstageResolutionOutcome = (typeof BACKSTAGE_RESOLUTION_OUTCOMES)[number];

export const BACKSTAGE_REVIEW_ENTRY_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  obligationId: NON_EMPTY_STRING_SCHEMA,
  outcome: stringEnumSchema(BACKSTAGE_RESOLUTION_OUTCOMES),
  reasonCode: NON_EMPTY_STRING_SCHEMA,
  note: NON_EMPTY_STRING_SCHEMA,
  reviewedAt: ISO_INSTANT_SCHEMA,
});

/** 后台压力计数：跨回合的连续无代价计数器 */
export const BACKSTAGE_PRESSURE_STATE_SCHEMA = Type.Object({
  consecutiveNoCostTurns: Type.Integer({ minimum: 0 }),
});

export type BackstagePressureState = Static<typeof BACKSTAGE_PRESSURE_STATE_SCHEMA>;
