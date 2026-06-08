import type { SceneEventResult } from "./scene";
import type { TurnTimePolicy } from "./state";

import { Temporal } from "@js-temporal/polyfill";

import { assertNonEmptyString, assertNonNegativeInteger, updateState } from "./state";

export function applyTurnTime(time: TurnTimePolicy): SceneEventResult {
  assertNonEmptyString(time.reason, "time.reason");
  switch (time.kind) {
    case "elapsed":
      return advanceTurnTime(time.elapsedMinutes);
    case "travel":
      return travelTurnTime(time);
    default:
      throw new Error("unreachable turn time kind");
  }
}

function advanceTurnTime(elapsedMinutesInput: number): SceneEventResult {
  const elapsedMinutes = assertPositiveElapsedMinutes(elapsedMinutesInput);
  updateState((draft) => {
    const nextTime = Temporal.Instant.from(draft.public.clock.currentAt)
      .add({ minutes: elapsedMinutes })
      .toString();
    draft.public.clock.currentAt = nextTime;
    draft.public.scene.lastResolvedAt = nextTime;
  });
  return { message: `时间已推进 ${elapsedMinutes} 分钟。` };
}

function travelTurnTime(time: Extract<TurnTimePolicy, { kind: "travel" }>): SceneEventResult {
  const elapsedMinutes = assertPositiveElapsedMinutes(time.elapsedMinutes);
  updateState((draft) => {
    const nextTime = Temporal.Instant.from(draft.public.clock.currentAt)
      .add({ minutes: elapsedMinutes })
      .toString();
    draft.public.clock.currentAt = nextTime;
    draft.public.scene.lastResolvedAt = nextTime;
    draft.public.scene.location = time.location;
  });
  return { message: `地点已更新，经过 ${elapsedMinutes} 分钟。` };
}

function assertPositiveElapsedMinutes(value: unknown): number {
  const elapsedMinutes = assertNonNegativeInteger(value, "elapsedMinutes");
  if (elapsedMinutes === 0) {
    throw new Error("elapsedMinutes 必须大于 0。");
  }
  return elapsedMinutes;
}
