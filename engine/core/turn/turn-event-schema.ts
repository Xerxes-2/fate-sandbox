import type { Static } from "typebox";

import { Type } from "typebox";

import { ACTOR_CONDITION_EVENT_SCHEMA } from "../actor/actor-condition-schema.ts";
import { SCENE_PRESENCE_INPUT_SCHEMA } from "../actor/actor-schema.ts";
import { SERVANT_FORM_EVENT_SCHEMA } from "../actor/servant-schema.ts";
import { ECONOMY_EVENT_SCHEMA } from "../economy/economy-schema.ts";
import { MEMORY_EVENT_SCHEMA } from "../memory/memory-schema.ts";
import { SCENE_EVENT_SCHEMA } from "../scene/scene-schema.ts";

export const TURN_COMMIT_EVENT_SCHEMA = Type.Union([
  Type.Object({
    kind: Type.Literal("scene"),
    event: SCENE_EVENT_SCHEMA,
  }),
  Type.Object({
    kind: Type.Literal("scene-presence"),
    event: SCENE_PRESENCE_INPUT_SCHEMA,
  }),
  Type.Object({
    kind: Type.Literal("actor-condition"),
    event: ACTOR_CONDITION_EVENT_SCHEMA,
  }),
  Type.Object({
    kind: Type.Literal("servant-form"),
    event: SERVANT_FORM_EVENT_SCHEMA,
  }),
  Type.Object({
    kind: Type.Literal("economy"),
    event: ECONOMY_EVENT_SCHEMA,
  }),
  Type.Object({
    kind: Type.Literal("memory"),
    event: MEMORY_EVENT_SCHEMA,
  }),
]);

export type TurnCommitEvent = Static<typeof TURN_COMMIT_EVENT_SCHEMA>;
