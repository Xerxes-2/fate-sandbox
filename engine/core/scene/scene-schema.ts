import type { Static } from "typebox";

import type { TypeBoxValidator } from "../utils/typebox-validation.ts";

import { Type } from "typebox";
import { Compile } from "typebox/compile";

import {
  ISO_INSTANT_SCHEMA,
  NON_EMPTY_STRING_ARRAY_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  nullable,
} from "../state/schema-primitives.ts";
import {
  SCENE_THREAT_SEVERITY_SCHEMA,
  SITUATION_KIND_SCHEMA,
  stringEnumSchema,
} from "../state/state-enum-schemas.ts";
import { LOCATION_STATE_SCHEMA } from "../turn/turn-time-schema.ts";
import { parseTaggedTypeBoxUnion, trimStringsDeep } from "../utils/typebox-validation.ts";
import {
  SCENE_BEAT_ACTION_POLICY_SCHEMA,
  SCENE_BEAT_MEMORY_INPUT_SCHEMA,
  SCENE_BEAT_NEXT_BEAT_INPUT_SCHEMA,
  SCENE_BEAT_PRESENCE_INPUT_SCHEMA,
  SCENE_BEAT_THREAT_INPUT_SCHEMA,
} from "./scene-beat-schema.ts";

/**
 * Scene 领域事件的工具边界 schema：单一事实来源。
 * SceneEvent 类型由此派生（scene.ts re-export 原名）。
 */
export const SCENE_EVENT_KINDS = [
  "set-location",
  "set-situation",
  "add-objective",
  "resolve-objective",
  "add-threat",
  "clear-threat",
  "begin-beat",
  "complete-beat",
] as const;
const SCENE_EVENT_KIND_SCHEMA = stringEnumSchema(SCENE_EVENT_KINDS);

// ── beat lifecycle 子事件（backport lotm 8d72578）────────────────────────────
// beat 开启/收口不再是独立工具；它们是 commit_turn events 里的 scene 子事件。
// time 由 commit_turn 顶层提交，所以这里没有 time 字段。

export const BEGIN_BEAT_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("begin-beat"),
  title: Type.String({ minLength: 1 }),
  objectives: Type.Array(Type.String({ minLength: 1 })),
  purpose: Type.String({ minLength: 1 }),
  beatId: Type.Optional(Type.String({ minLength: 1 })),
  actionPolicy: Type.Optional(SCENE_BEAT_ACTION_POLICY_SCHEMA),
  threats: Type.Optional(Type.Array(SCENE_BEAT_THREAT_INPUT_SCHEMA)),
  presence: Type.Optional(SCENE_BEAT_PRESENCE_INPUT_SCHEMA),
  situation: Type.Optional(SITUATION_KIND_SCHEMA),
});

export const COMPLETE_BEAT_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("complete-beat"),
  outcome: Type.String({ minLength: 1 }),
  memory: Type.Optional(SCENE_BEAT_MEMORY_INPUT_SCHEMA),
  nextBeat: Type.Optional(Type.Union([SCENE_BEAT_NEXT_BEAT_INPUT_SCHEMA, Type.Null()])),
  presence: Type.Optional(SCENE_BEAT_PRESENCE_INPUT_SCHEMA),
  situation: Type.Optional(SITUATION_KIND_SCHEMA),
});

// storyWindow 持久化 schema（state-schema 复用）。
export const STORY_WINDOW_STATE_SCHEMA = Type.Object({
  currentArcId: Type.String({ minLength: 1 }),
  currentBeatId: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
  allowedActions: Type.Array(Type.String({ minLength: 1 })),
  forbiddenEscalations: Type.Array(Type.String({ minLength: 1 })),
  completionCriteria: Type.Array(Type.String({ minLength: 1 })),
  nextBeatHints: Type.Array(Type.String({ minLength: 1 })),
});

export const SET_LOCATION_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("set-location"),
  location: LOCATION_STATE_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

export const SET_SITUATION_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("set-situation"),
  situation: SITUATION_KIND_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

export const ADD_OBJECTIVE_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("add-objective"),
  summary: Type.String({ minLength: 1 }),
  reason: Type.String({ minLength: 1 }),
});

export const RESOLVE_OBJECTIVE_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("resolve-objective"),
  objectiveId: Type.Optional(Type.String({ minLength: 1 })),
  objectiveSummary: Type.Optional(Type.String({ minLength: 1 })),
  reason: Type.String({ minLength: 1 }),
});

export const ADD_THREAT_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("add-threat"),
  summary: Type.String({ minLength: 1 }),
  severity: SCENE_THREAT_SEVERITY_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

export const CLEAR_THREAT_EVENT_SCHEMA = Type.Object({
  kind: Type.Literal("clear-threat"),
  // 二选一：threatSummary 逐字复制 GM Brief「当前威胁」里的 summary（推荐，
  // 与 resolve-objective 的 objectiveSummary 后备定位方式对称），或 threatId 直引投影出的 id。
  // 两者都缺时 clearThreat 抛带可用清单的错误，引导模型补齐。
  threatId: Type.Optional(Type.String({ minLength: 1 })),
  threatSummary: Type.Optional(Type.String({ minLength: 1 })),
  reason: Type.String({ minLength: 1 }),
});

export const SCENE_EVENT_SCHEMA = Type.Union([
  SET_LOCATION_EVENT_SCHEMA,
  SET_SITUATION_EVENT_SCHEMA,
  ADD_OBJECTIVE_EVENT_SCHEMA,
  RESOLVE_OBJECTIVE_EVENT_SCHEMA,
  ADD_THREAT_EVENT_SCHEMA,
  CLEAR_THREAT_EVENT_SCHEMA,
  BEGIN_BEAT_EVENT_SCHEMA,
  COMPLETE_BEAT_EVENT_SCHEMA,
]);

export type SceneEvent = Static<typeof SCENE_EVENT_SCHEMA>;

const SCENE_EVENT_KIND_VALIDATOR = Compile(SCENE_EVENT_KIND_SCHEMA);
const SET_LOCATION_EVENT_VALIDATOR = Compile(SET_LOCATION_EVENT_SCHEMA);
const SET_SITUATION_EVENT_VALIDATOR = Compile(SET_SITUATION_EVENT_SCHEMA);
const ADD_OBJECTIVE_EVENT_VALIDATOR = Compile(ADD_OBJECTIVE_EVENT_SCHEMA);
const RESOLVE_OBJECTIVE_EVENT_VALIDATOR = Compile(RESOLVE_OBJECTIVE_EVENT_SCHEMA);
const ADD_THREAT_EVENT_VALIDATOR = Compile(ADD_THREAT_EVENT_SCHEMA);
const CLEAR_THREAT_EVENT_VALIDATOR = Compile(CLEAR_THREAT_EVENT_SCHEMA);
const BEGIN_BEAT_EVENT_VALIDATOR = Compile(BEGIN_BEAT_EVENT_SCHEMA);
const COMPLETE_BEAT_EVENT_VALIDATOR = Compile(COMPLETE_BEAT_EVENT_SCHEMA);

// 注意：Compile 必须在独立常量上调用，不能内联在带 satisfies 的对象字面量里——
// 上下文类型会干扰泛型推导，把 Validator 退化成 unknown。
const SCENE_EVENT_VARIANT_VALIDATORS = {
  "set-location": SET_LOCATION_EVENT_VALIDATOR,
  "set-situation": SET_SITUATION_EVENT_VALIDATOR,
  "add-objective": ADD_OBJECTIVE_EVENT_VALIDATOR,
  "resolve-objective": RESOLVE_OBJECTIVE_EVENT_VALIDATOR,
  "add-threat": ADD_THREAT_EVENT_VALIDATOR,
  "clear-threat": CLEAR_THREAT_EVENT_VALIDATOR,
  "begin-beat": BEGIN_BEAT_EVENT_VALIDATOR,
  "complete-beat": COMPLETE_BEAT_EVENT_VALIDATOR,
} satisfies Record<SceneEvent["kind"], TypeBoxValidator<SceneEvent>>;

export function parseSceneEvent(value: unknown, fieldName: string): SceneEvent {
  return parseTaggedTypeBoxUnion<SceneEvent["kind"], SceneEvent>(
    trimStringsDeep(value),
    fieldName,
    "kind",
    SCENE_EVENT_KIND_VALIDATOR,
    SCENE_EVENT_VARIANT_VALIDATORS,
  );
}

/**
 * ---- Scene 状态树 schema（自 state-schema.ts 分拆而来） ----
 * 状态类型在同域 *-state.ts 从这里派生，schema 是唯一事实源。
 */

export const SCENE_OBJECTIVE_STATUSES = ["active", "blocked", "resolved"] as const;
const SCENE_OBJECTIVE_STATUS_SCHEMA = stringEnumSchema(SCENE_OBJECTIVE_STATUSES);

export const SCENE_OBJECTIVE_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  summary: NON_EMPTY_STRING_SCHEMA,
  status: SCENE_OBJECTIVE_STATUS_SCHEMA,
});

export const SCENE_THREAT_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  summary: NON_EMPTY_STRING_SCHEMA,
  severity: SCENE_THREAT_SEVERITY_SCHEMA,
});

export const SCENE_STATE_SCHEMA = Type.Object({
  location: LOCATION_STATE_SCHEMA,
  situation: SITUATION_KIND_SCHEMA,
  storyWindow: nullable(STORY_WINDOW_STATE_SCHEMA),
  presentActorIds: NON_EMPTY_STRING_ARRAY_SCHEMA,
  objectives: Type.Array(SCENE_OBJECTIVE_SCHEMA),
  threats: Type.Array(SCENE_THREAT_SCHEMA),
  lastResolvedAt: ISO_INSTANT_SCHEMA,
});
