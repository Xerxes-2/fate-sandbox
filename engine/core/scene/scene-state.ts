import type { Static } from "typebox";

import type {
  SCENE_OBJECTIVE_SCHEMA,
  SCENE_OBJECTIVE_STATUSES,
  SCENE_STATE_SCHEMA,
  SCENE_THREAT_SCHEMA,
  STORY_WINDOW_STATE_SCHEMA,
} from "./scene-schema.ts";

/**
 * Scene 领域状态类型：自 scene-schema.ts 的 TypeBox schema 派生，
 * schema 是唯一事实源——改状态形状只改 schema，类型自动跟进。
 * 对外仍经 state.ts re-export 原名。
 */

export type SceneObjectiveStatus = (typeof SCENE_OBJECTIVE_STATUSES)[number];

export type SceneState = Static<typeof SCENE_STATE_SCHEMA>;
export type StoryWindowState = Static<typeof STORY_WINDOW_STATE_SCHEMA>;
export type SceneObjective = Static<typeof SCENE_OBJECTIVE_SCHEMA>;
export type SceneThreat = Static<typeof SCENE_THREAT_SCHEMA>;
