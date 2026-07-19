import { Type } from "typebox";

import { TURN_COMMIT_EVENT_SCHEMA } from "../../engine/core/turn/turn-event-schema.ts";

/** Model-facing event list backed by the engine's authoritative discriminated union. */
export function commitTurnEventsToolSchema(): ReturnType<typeof Type.Array> {
  return Type.Array(TURN_COMMIT_EVENT_SCHEMA);
}
