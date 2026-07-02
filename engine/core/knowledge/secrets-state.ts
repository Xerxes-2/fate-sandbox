import type { Static } from "typebox";

import type {
  ACTOR_AGENDA_STATE_SCHEMA,
  ACTOR_KNOWLEDGE_LENS_SCHEMA,
  ACTOR_SECRET_SLOTS_SCHEMA,
  SECRET_ACTOR_STATE_SCHEMA,
  SECRET_CAMPAIGN_FACT_SCHEMA,
  SECRET_EVENT_MEMORY_SCHEMA,
  SECRET_REVEAL_STATES,
} from "./secrets-schema.ts";

/**
 * Secrets 领域状态类型：自 secrets-schema.ts 的 TypeBox schema 派生，
 * schema 是唯一事实源——改状态形状只改 schema，类型自动跟进。
 * 例外：SecretSlot<T> 是泛型（消费方需要 SecretSlot<string> / SecretSlot<unknown>），
 * 保持手写；schema 侧的 STRING/NOBLE_PHANTASM 具体 slot 与之结构一致。
 * 对外仍经 state.ts re-export 原名。
 */

export type SecretRevealState = (typeof SECRET_REVEAL_STATES)[number];

export interface SecretSlot<T> {
  id: string;
  value: T;
  revealState: SecretRevealState;
  revealConditions: string[];
}

/**
 * 单个 actor 的隐藏聚合：他秘密是什么（secrets）、想要什么（agenda）、知道什么（knowledgeLens）。
 * 三个 facet 都是可选的；bundle.actorId 始终等于其在 actorStates 里的 key。
 * 访问一律走 secret-actor-state.ts 的访问器，不允许裸 nested 写入（由它统一维护空 bundle 修剪）。
 */
export type SecretActorState = Static<typeof SECRET_ACTOR_STATE_SCHEMA>;

export type ActorSecretSlots = Static<typeof ACTOR_SECRET_SLOTS_SCHEMA>;
export type ActorAgendaState = Static<typeof ACTOR_AGENDA_STATE_SCHEMA>;
export type ActorKnowledgeLens = Static<typeof ACTOR_KNOWLEDGE_LENS_SCHEMA>;
export type SecretCampaignFact = Static<typeof SECRET_CAMPAIGN_FACT_SCHEMA>;
export type SecretEventMemory = Static<typeof SECRET_EVENT_MEMORY_SCHEMA>;
