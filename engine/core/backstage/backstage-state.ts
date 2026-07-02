import type { Static } from "typebox";

import type {
  BACKSTAGE_OBLIGATION_SCHEMA,
  BACKSTAGE_PENDING_HARVEST_SCHEMA,
  BACKSTAGE_REVIEW_ENTRY_SCHEMA,
  FACTION_CLOCK_SCHEMA,
  SCHEDULED_EVENT_SCHEMA,
} from "./backstage-state-schema.ts";

/**
 * Backstage 领域状态类型：自 backstage-state-schema.ts 的 TypeBox schema 派生，
 * schema 是唯一事实源——改状态形状只改 schema，类型自动跟进。
 * 对外仍经 state.ts re-export 原名。（OffscreenEvent 本就住在 parallel-line.ts；
 * BackstageTrigger / BackstageResolutionOutcome / BackstagePressureState
 * 随其枚举 tuple 住在 backstage-state-schema.ts。）
 */

export type {
  BackstagePressureState,
  BackstageResolutionOutcome,
  BackstageTrigger,
} from "./backstage-state-schema.ts";

export type BackstageObligation = Static<typeof BACKSTAGE_OBLIGATION_SCHEMA>;
export type BackstageReviewEntry = Static<typeof BACKSTAGE_REVIEW_ENTRY_SCHEMA>;
export type BackstagePendingHarvest = Static<typeof BACKSTAGE_PENDING_HARVEST_SCHEMA>;
export type FactionClock = Static<typeof FACTION_CLOCK_SCHEMA>;
export type ScheduledEvent = Static<typeof SCHEDULED_EVENT_SCHEMA>;
