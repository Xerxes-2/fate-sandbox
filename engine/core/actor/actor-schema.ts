import type { Static } from "typebox";

import type {
  FateRank,
  FateRankOrUnknown,
  FateRankRange,
  PublicActorState,
} from "../state/state.ts";
import type { TypeBoxValidator } from "../utils/typebox-validation.ts";

import { Type } from "typebox";
import { Compile } from "typebox/compile";

import {
  ISO_INSTANT_SCHEMA,
  NON_EMPTY_STRING_ARRAY_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  nullable,
  PERCENT_SCHEMA,
} from "../state/schema-primitives.ts";
import {
  ACTOR_KIND_SCHEMA,
  ACTOR_STANCE_SCHEMA,
  CIRCUIT_STATUS_SCHEMA,
  CONTRACT_STATUS_SCHEMA,
  FATE_PARAM_KEY_SCHEMA,
  MANA_SUPPLY_SCHEMA,
  REVEAL_STATUS_SCHEMA,
  SERVANT_CLASS_SCHEMA,
  stringEnumSchema,
  TRACKED_ITEM_CONDITION_SCHEMA,
  TRACKED_ITEM_KIND_SCHEMA,
  TRACKED_ITEM_VISIBILITY_SCHEMA,
  WOUND_SEVERITY_SCHEMA,
} from "../state/state-enum-schemas.ts";
import { LOCATION_STATE_SCHEMA } from "../state/turn-time-schema.ts";
import {
  parseTaggedTypeBoxUnion,
  parseTypeBoxValue,
  trimStringsDeep,
} from "../utils/typebox-validation.ts";

/**
 * Actor 领域工具边界 schema：单一事实来源。
 * 对应输入类型由此派生（actor.ts re-export 原名）。
 */
export const SCENE_PRESENCE_INPUT_SCHEMA = Type.Object({
  presentActorIds: Type.Array(Type.String({ minLength: 1 })),
  allyActorIds: Type.Array(Type.String({ minLength: 1 })),
  reason: Type.String({ minLength: 1 }),
});

export type ScenePresenceInput = Static<typeof SCENE_PRESENCE_INPUT_SCHEMA>;

const SCENE_PRESENCE_INPUT_VALIDATOR = Compile(SCENE_PRESENCE_INPUT_SCHEMA);

export function parseScenePresenceInput(value: unknown, fieldName: string): ScenePresenceInput {
  return parseTypeBoxValue(trimStringsDeep(value), fieldName, SCENE_PRESENCE_INPUT_VALIDATOR);
}

export const RETIRE_ACTOR_INPUT_SCHEMA = Type.Object({
  actorId: Type.String({ minLength: 1 }),
  reason: Type.String({ minLength: 1 }),
});

export type RetireActorInput = Static<typeof RETIRE_ACTOR_INPUT_SCHEMA>;

const RETIRE_ACTOR_INPUT_VALIDATOR = Compile(RETIRE_ACTOR_INPUT_SCHEMA);

export function parseRetireActorInput(value: unknown, fieldName: string): RetireActorInput {
  return parseTypeBoxValue(trimStringsDeep(value), fieldName, RETIRE_ACTOR_INPUT_VALIDATOR);
}

/** Fate rank 文法与 engine/core/fate-rank.ts 保持一致。 */
const FATE_RANK_PATTERN_FRAGMENT = "(?:E|D|C|B|A|EX)(?:\\+{1,3}|-)?";

export const FATE_RANK_OR_NONE_SCHEMA = Type.Unsafe<FateRank | "none">({
  type: "string",
  pattern: `^(?:${FATE_RANK_PATTERN_FRAGMENT}|none)$`,
});

/** 宝具评级：单值、可变范围（如 E~A++）或 none（无宝具）。 */
export const NOBLE_PHANTASM_RANK_SCHEMA = Type.Unsafe<FateRank | FateRankRange | "none">({
  type: "string",
  pattern: `^(?:${FATE_RANK_PATTERN_FRAGMENT}(?:~${FATE_RANK_PATTERN_FRAGMENT})?|none)$`,
});

export const NOBLE_PHANTASM_SCHEMA = Type.Object({
  name: Type.String({ minLength: 1 }),
  rank: NOBLE_PHANTASM_RANK_SCHEMA,
  kind: Type.String({ minLength: 1 }),
  status: REVEAL_STATUS_SCHEMA,
  summary: Type.String({ minLength: 1 }),
});

export type NoblePhantasm = Static<typeof NOBLE_PHANTASM_SCHEMA>;

export const OUTFIT_STATE_SCHEMA = Type.Object({
  label: Type.String({ minLength: 1 }),
  details: Type.String({ minLength: 1 }),
});

export const FATE_RANK_SCHEMA = Type.Unsafe<FateRank>({
  type: "string",
  pattern: `^${FATE_RANK_PATTERN_FRAGMENT}$`,
});

/** 参数允许 unknown：未被观测/拍板的对手参数走中性比较路径。 */
export const FATE_RANK_OR_UNKNOWN_SCHEMA = Type.Unsafe<FateRankOrUnknown>({
  type: "string",
  pattern: `^(?:${FATE_RANK_PATTERN_FRAGMENT}|unknown)$`,
});

export const FATE_PARAMS_SCHEMA = Type.Object({
  strength: FATE_RANK_OR_UNKNOWN_SCHEMA,
  endurance: FATE_RANK_OR_UNKNOWN_SCHEMA,
  agility: FATE_RANK_OR_UNKNOWN_SCHEMA,
  mana: FATE_RANK_OR_UNKNOWN_SCHEMA,
  luck: FATE_RANK_OR_UNKNOWN_SCHEMA,
  noblePhantasm: FATE_RANK_OR_UNKNOWN_SCHEMA,
});

export const SERVANT_SKILL_SCHEMA = Type.Object({
  name: Type.String({ minLength: 1 }),
  rank: FATE_RANK_OR_NONE_SCHEMA,
  summary: Type.String({ minLength: 1 }),
});

export const RELATIONSHIP_STATE_SCHEMA = Type.Object({
  stance: ACTOR_STANCE_SCHEMA,
  summary: Type.String({ minLength: 1 }),
});

export const COMMAND_SPELL_STATE_SCHEMA = Type.Object({
  total: Type.Integer({ minimum: 0 }),
  remaining: Type.Integer({ minimum: 0 }),
});

const MASTER_ROLE_SCHEMA = Type.Object({
  kind: Type.Literal("master"),
  commandSpells: COMMAND_SPELL_STATE_SCHEMA,
  contractedServantIds: Type.Array(Type.String({ minLength: 1 })),
});

const SOCIAL_ROLE_SCHEMA = Type.Object({
  kind: Type.Literal("social"),
  label: Type.String({ minLength: 1 }),
});

const FACTION_ROLE_SCHEMA = Type.Object({
  kind: Type.Literal("faction"),
  factionId: Type.String({ minLength: 1 }),
  label: Type.String({ minLength: 1 }),
});

export const ACTOR_ROLE_SCHEMA = Type.Union([
  MASTER_ROLE_SCHEMA,
  SOCIAL_ROLE_SCHEMA,
  FACTION_ROLE_SCHEMA,
]);

export const PUBLIC_NPC_INPUT_SCHEMA = Type.Object({
  id: Type.String({ minLength: 1 }),
  kind: ACTOR_KIND_SCHEMA,
  internalName: Type.String({ minLength: 1 }),
  renderName: Type.Optional(Type.String({ minLength: 1 })),
  publicIdentity: Type.String({ minLength: 1 }),
  apparentAge: Type.String({ minLength: 1 }),
  outfit: OUTFIT_STATE_SCHEMA,
  demeanor: Type.String({ minLength: 1 }),
  publicRoles: Type.Array(ACTOR_ROLE_SCHEMA),
  relationshipToProtagonist: RELATIONSHIP_STATE_SCHEMA,
  ordinaryItems: Type.Array(Type.String({ minLength: 1 })),
});
export type PublicNpcInput = Static<typeof PUBLIC_NPC_INPUT_SCHEMA>;

export const PUBLIC_NPC_SKELETON_INPUT_SCHEMA = Type.Object({
  actorId: Type.String({ minLength: 1 }),
  npcKind: Type.Optional(ACTOR_KIND_SCHEMA),
  internalName: Type.String({ minLength: 1 }),
  renderName: Type.Optional(Type.String({ minLength: 1 })),
  publicIdentity: Type.String({ minLength: 1 }),
  apparentAge: Type.Optional(Type.String({ minLength: 1 })),
  outfit: Type.Optional(OUTFIT_STATE_SCHEMA),
  demeanor: Type.Optional(Type.String({ minLength: 1 })),
  publicRoles: Type.Optional(Type.Array(ACTOR_ROLE_SCHEMA)),
  relationshipToProtagonist: Type.Optional(RELATIONSHIP_STATE_SCHEMA),
  ordinaryItems: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});
export type PublicNpcSkeletonInput = Static<typeof PUBLIC_NPC_SKELETON_INPUT_SCHEMA>;

export const SERVANT_INPUT_SCHEMA = Type.Object({
  id: Type.String({ minLength: 1 }),
  internalName: Type.String({ minLength: 1 }),
  renderName: Type.Optional(Type.String({ minLength: 1 })),
  publicIdentity: Type.String({ minLength: 1 }),
  apparentAge: Type.String({ minLength: 1 }),
  outfit: OUTFIT_STATE_SCHEMA,
  demeanor: Type.String({ minLength: 1 }),
  className: SERVANT_CLASS_SCHEMA,
  trueNameDisplay: Type.String({ minLength: 1 }),
  trueNameStatus: REVEAL_STATUS_SCHEMA,
  parameters: FATE_PARAMS_SCHEMA,
  classSkills: Type.Array(SERVANT_SKILL_SCHEMA),
  personalSkills: Type.Array(SERVANT_SKILL_SCHEMA),
  noblePhantasms: Type.Array(NOBLE_PHANTASM_SCHEMA),
  spiritualCore: Type.Integer(),
  mana: Type.Integer(),
  spiritualCondition: Type.String({ minLength: 1 }),
  masterActorId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  masterName: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  contractStatus: stringEnumSchema(["stable", "weak", "cut", "masterless"]),
  manaSupply: stringEnumSchema(["sufficient", "strained", "starved"]),
  currentOrder: Type.String({ minLength: 1 }),
  publicRoles: Type.Optional(Type.Array(ACTOR_ROLE_SCHEMA)),
  relationshipToProtagonist: Type.Optional(RELATIONSHIP_STATE_SCHEMA),
  ordinaryItems: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});
export type ServantInput = Static<typeof SERVANT_INPUT_SCHEMA>;

/** setup-protagonist 的 actor 整体由 Domain Event Tool Runner 提交时的 assertState 负责校验；这里故意放行。 */
const PUBLIC_ACTOR_STATE_DELEGATED_SCHEMA = Type.Unsafe<PublicActorState>({});

export const ACTOR_REGISTRY_KINDS = [
  "setup-protagonist",
  "upsert-public-npc",
  "ensure-public-npc",
  "upsert-servant",
] as const;
const ACTOR_REGISTRY_KIND_SCHEMA = stringEnumSchema(ACTOR_REGISTRY_KINDS);

const SETUP_PROTAGONIST_INPUT_SCHEMA = Type.Object({
  kind: Type.Literal("setup-protagonist"),
  actor: PUBLIC_ACTOR_STATE_DELEGATED_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

const UPSERT_PUBLIC_NPC_INPUT_SCHEMA = Type.Object({
  kind: Type.Literal("upsert-public-npc"),
  npc: PUBLIC_NPC_INPUT_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

const ENSURE_PUBLIC_NPC_INPUT_SCHEMA = Type.Object({
  kind: Type.Literal("ensure-public-npc"),
  npc: PUBLIC_NPC_SKELETON_INPUT_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

const UPSERT_SERVANT_INPUT_SCHEMA = Type.Object({
  kind: Type.Literal("upsert-servant"),
  servant: SERVANT_INPUT_SCHEMA,
  reason: Type.String({ minLength: 1 }),
});

export type ActorRegistryInput =
  | Static<typeof SETUP_PROTAGONIST_INPUT_SCHEMA>
  | Static<typeof UPSERT_PUBLIC_NPC_INPUT_SCHEMA>
  | Static<typeof ENSURE_PUBLIC_NPC_INPUT_SCHEMA>
  | Static<typeof UPSERT_SERVANT_INPUT_SCHEMA>;

const ACTOR_REGISTRY_KIND_VALIDATOR = Compile(ACTOR_REGISTRY_KIND_SCHEMA);
const SETUP_PROTAGONIST_INPUT_VALIDATOR = Compile(SETUP_PROTAGONIST_INPUT_SCHEMA);
const UPSERT_PUBLIC_NPC_INPUT_VALIDATOR = Compile(UPSERT_PUBLIC_NPC_INPUT_SCHEMA);
const ENSURE_PUBLIC_NPC_INPUT_VALIDATOR = Compile(ENSURE_PUBLIC_NPC_INPUT_SCHEMA);
const UPSERT_SERVANT_INPUT_VALIDATOR = Compile(UPSERT_SERVANT_INPUT_SCHEMA);

// Compile 必须在独立常量上调用（satisfies 上下文会干扰泛型推导）。
const ACTOR_REGISTRY_VARIANT_VALIDATORS = {
  "setup-protagonist": SETUP_PROTAGONIST_INPUT_VALIDATOR,
  "upsert-public-npc": UPSERT_PUBLIC_NPC_INPUT_VALIDATOR,
  "ensure-public-npc": ENSURE_PUBLIC_NPC_INPUT_VALIDATOR,
  "upsert-servant": UPSERT_SERVANT_INPUT_VALIDATOR,
} satisfies Record<ActorRegistryInput["kind"], TypeBoxValidator<ActorRegistryInput>>;

export function parseActorRegistryInput(value: unknown, fieldName: string): ActorRegistryInput {
  return parseTaggedTypeBoxUnion<ActorRegistryInput["kind"], ActorRegistryInput>(
    trimStringsDeep(value),
    fieldName,
    "kind",
    ACTOR_REGISTRY_KIND_VALIDATOR,
    ACTOR_REGISTRY_VARIANT_VALIDATORS,
  );
}

/**
 * ---- Actor 状态树 schema（自 state-schema.ts 分拆而来） ----
 * 与 state.ts 手写接口一一对应；漂移由 state-schema.ts 底部的
 * 双向赋值检查在编译期拦截。
 */

const MAGECRAFT_CIRCUIT_STATE_SCHEMA = Type.Object({
  count: NON_EMPTY_STRING_SCHEMA,
  quality: FATE_RANK_OR_NONE_SCHEMA,
  od: PERCENT_SCHEMA,
  status: CIRCUIT_STATUS_SCHEMA,
  traits: NON_EMPTY_STRING_ARRAY_SCHEMA,
});

const MAGECRAFT_DISCIPLINE_SCHEMA = Type.Object({
  name: NON_EMPTY_STRING_SCHEMA,
  rank: FATE_RANK_OR_NONE_SCHEMA,
  notes: NON_EMPTY_STRING_SCHEMA,
});

const MAGECRAFT_CAPABILITY_SCHEMA = Type.Object({
  circuits: MAGECRAFT_CIRCUIT_STATE_SCHEMA,
  disciplines: Type.Array(MAGECRAFT_DISCIPLINE_SCHEMA),
  affiliation: nullable(NON_EMPTY_STRING_SCHEMA),
});

const IDENTITY_STATE_SCHEMA = Type.Object({
  publicIdentity: NON_EMPTY_STRING_SCHEMA,
  background: NON_EMPTY_STRING_SCHEMA,
  lockedFacts: Type.Array(
    Type.Object({ id: NON_EMPTY_STRING_SCHEMA, text: NON_EMPTY_STRING_SCHEMA }),
  ),
});

const PRESENTATION_STATE_SCHEMA = Type.Object({
  internalName: NON_EMPTY_STRING_SCHEMA,
  renderName: NON_EMPTY_STRING_SCHEMA,
  apparentAge: NON_EMPTY_STRING_SCHEMA,
  outfit: OUTFIT_STATE_SCHEMA,
  demeanor: NON_EMPTY_STRING_SCHEMA,
});

const WOUND_STATE_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  severity: WOUND_SEVERITY_SCHEMA,
  text: NON_EMPTY_STRING_SCHEMA,
  recoverable: Type.Boolean(),
  treatment: nullable(NON_EMPTY_STRING_SCHEMA),
});

const AFFLICTION_STATE_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  source: NON_EMPTY_STRING_SCHEMA,
  text: NON_EMPTY_STRING_SCHEMA,
  expectedDuration: nullable(NON_EMPTY_STRING_SCHEMA),
});

const PERMANENT_EFFECT_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  source: NON_EMPTY_STRING_SCHEMA,
  text: NON_EMPTY_STRING_SCHEMA,
  mechanicalEffect: NON_EMPTY_STRING_SCHEMA,
});

const CONDITION_STATE_SCHEMA = Type.Object({
  wounds: Type.Array(WOUND_STATE_SCHEMA),
  afflictions: Type.Array(AFFLICTION_STATE_SCHEMA),
  permanentEffects: Type.Array(PERMANENT_EFFECT_SCHEMA),
});

const INVENTORY_STATE_SCHEMA = Type.Object({
  ordinaryItems: NON_EMPTY_STRING_ARRAY_SCHEMA,
});

const ABILITY_STATE_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  label: NON_EMPTY_STRING_SCHEMA,
  summary: NON_EMPTY_STRING_SCHEMA,
});

const TRUE_NAME_STATE_SCHEMA = Type.Object({
  status: REVEAL_STATUS_SCHEMA,
  display: NON_EMPTY_STRING_SCHEMA,
});

const SERVANT_IDENTITY_STATE_SCHEMA = Type.Object({
  className: SERVANT_CLASS_SCHEMA,
  trueName: TRUE_NAME_STATE_SCHEMA,
  locked: Type.Literal(true),
});

const RESOURCE_TRACK_SCHEMA = Type.Object({ value: PERCENT_SCHEMA });

const SERVANT_CONDITION_STATE_SCHEMA = Type.Object({
  spiritualCore: RESOURCE_TRACK_SCHEMA,
  mana: RESOURCE_TRACK_SCHEMA,
  spiritualCondition: NON_EMPTY_STRING_SCHEMA,
  permanentDefects: Type.Array(PERMANENT_EFFECT_SCHEMA),
});

const SERVANT_CONTRACT_STATE_SCHEMA = Type.Object({
  masterActorId: nullable(NON_EMPTY_STRING_SCHEMA),
  masterName: nullable(NON_EMPTY_STRING_SCHEMA),
  status: CONTRACT_STATUS_SCHEMA,
  manaSupply: MANA_SUPPLY_SCHEMA,
});

const PARAM_MODIFIER_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  source: NON_EMPTY_STRING_SCHEMA,
  affectedParams: Type.Array(FATE_PARAM_KEY_SCHEMA),
  summary: NON_EMPTY_STRING_SCHEMA,
  expiresAt: nullable(ISO_INSTANT_SCHEMA),
});

const SERVANT_PARAMETER_STATE_SCHEMA = Type.Object({
  base: FATE_PARAMS_SCHEMA,
  modifiers: Type.Array(PARAM_MODIFIER_SCHEMA),
  baseLocked: Type.Literal(true),
});

const SERVANT_SKILL_STATE_SCHEMA = Type.Object({
  classSkills: Type.Array(SERVANT_SKILL_SCHEMA),
  personalSkills: Type.Array(SERVANT_SKILL_SCHEMA),
});

export const SERVANT_CORE_STATE_SCHEMA = Type.Object({
  identity: SERVANT_IDENTITY_STATE_SCHEMA,
  condition: SERVANT_CONDITION_STATE_SCHEMA,
  contract: SERVANT_CONTRACT_STATE_SCHEMA,
  parameters: SERVANT_PARAMETER_STATE_SCHEMA,
  skills: SERVANT_SKILL_STATE_SCHEMA,
  noblePhantasms: Type.Array(NOBLE_PHANTASM_SCHEMA),
  currentOrder: NON_EMPTY_STRING_SCHEMA,
});

const ACTOR_BASE_PROPERTIES = {
  id: NON_EMPTY_STRING_SCHEMA,
  roles: Type.Array(ACTOR_ROLE_SCHEMA),
  magecraft: nullable(MAGECRAFT_CAPABILITY_SCHEMA),
  servantForm: nullable(SERVANT_CORE_STATE_SCHEMA),
  identity: IDENTITY_STATE_SCHEMA,
  presentation: PRESENTATION_STATE_SCHEMA,
  condition: CONDITION_STATE_SCHEMA,
  inventory: INVENTORY_STATE_SCHEMA,
  abilities: Type.Array(ABILITY_STATE_SCHEMA),
  relationshipToProtagonist: RELATIONSHIP_STATE_SCHEMA,
} as const;

const HUMAN_ACTOR_STATE_SCHEMA = Type.Object({
  ...ACTOR_BASE_PROPERTIES,
  kind: Type.Literal("human"),
});

const OUTSIDER_ACTOR_STATE_SCHEMA = Type.Object({
  ...ACTOR_BASE_PROPERTIES,
  kind: Type.Literal("outsider"),
  sourceProfile: NON_EMPTY_STRING_SCHEMA,
  fateTranslation: NON_EMPTY_STRING_SCHEMA,
  restrictions: NON_EMPTY_STRING_ARRAY_SCHEMA,
});

const SPIRIT_ACTOR_STATE_SCHEMA = Type.Object({
  ...ACTOR_BASE_PROPERTIES,
  kind: Type.Literal("spirit"),
  origin: NON_EMPTY_STRING_SCHEMA,
});

const OTHER_ACTOR_STATE_SCHEMA = Type.Object({
  ...ACTOR_BASE_PROPERTIES,
  kind: Type.Literal("other"),
  nature: NON_EMPTY_STRING_SCHEMA,
});

export const PUBLIC_ACTOR_STATE_SCHEMA = Type.Union([
  HUMAN_ACTOR_STATE_SCHEMA,
  OUTSIDER_ACTOR_STATE_SCHEMA,
  SPIRIT_ACTOR_STATE_SCHEMA,
  OTHER_ACTOR_STATE_SCHEMA,
]);

export const ACTOR_IMPRESSION_SCHEMA = Type.Object({
  actorId: NON_EMPTY_STRING_SCHEMA,
  presence: NON_EMPTY_STRING_SCHEMA,
  actionStyle: NON_EMPTY_STRING_SCHEMA,
  relationshipPosture: NON_EMPTY_STRING_SCHEMA,
  voiceMaterial: Type.String(),
  updatedAt: ISO_INSTANT_SCHEMA,
});

export const RELATIONSHIP_SIGNAL_VISIBILITIES = ["player-known", "secret"] as const;
const RELATIONSHIP_SIGNAL_VISIBILITY_SCHEMA = stringEnumSchema(RELATIONSHIP_SIGNAL_VISIBILITIES);

export const RELATIONSHIP_SIGNAL_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  actorId: NON_EMPTY_STRING_SCHEMA,
  targetActorId: NON_EMPTY_STRING_SCHEMA,
  signal: NON_EMPTY_STRING_SCHEMA,
  interpretation: NON_EMPTY_STRING_SCHEMA,
  boundary: NON_EMPTY_STRING_SCHEMA,
  sourceEventId: nullable(NON_EMPTY_STRING_SCHEMA),
  visibility: RELATIONSHIP_SIGNAL_VISIBILITY_SCHEMA,
});

export const TRACKED_ITEM_STATE_SCHEMA = Type.Object({
  id: NON_EMPTY_STRING_SCHEMA,
  label: NON_EMPTY_STRING_SCHEMA,
  kind: TRACKED_ITEM_KIND_SCHEMA,
  ownerActorId: nullable(NON_EMPTY_STRING_SCHEMA),
  holderActorId: nullable(NON_EMPTY_STRING_SCHEMA),
  location: nullable(LOCATION_STATE_SCHEMA),
  condition: TRACKED_ITEM_CONDITION_SCHEMA,
  visibility: TRACKED_ITEM_VISIBILITY_SCHEMA,
  notes: NON_EMPTY_STRING_ARRAY_SCHEMA,
});
