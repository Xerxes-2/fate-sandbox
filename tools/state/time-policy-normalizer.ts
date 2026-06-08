import type { LocationState, TurnTimePolicy } from "../../engine/core/state";

import { assertOneOf, assertRecord, assertString, normalizePositiveInteger } from "./tool-input";

const TIME_KINDS = ["elapsed", "travel"] as const;
const BOUNDARIES = ["normal", "bounded-field", "reality-marble", "otherworld"] as const satisfies readonly LocationState["boundary"][];

export function normalizeTurnTimePolicy(value: unknown, fieldName: string): TurnTimePolicy {
  const input = assertRecord(value, fieldName);
  const kind = assertOneOf(input["kind"], `${fieldName}.kind`, TIME_KINDS);
  const reason = assertString(input["reason"], `${fieldName}.reason`);
  switch (kind) {
    case "elapsed":
      return {
        kind,
        elapsedMinutes: normalizePositiveInteger(
          input["elapsedMinutes"],
          `${fieldName}.elapsedMinutes`,
        ),
        reason,
      };
    case "travel":
      return {
        kind,
        location: normalizeLocation(input["location"], `${fieldName}.location`),
        elapsedMinutes: normalizePositiveInteger(
          input["elapsedMinutes"],
          `${fieldName}.elapsedMinutes`,
        ),
        reason,
      };
    default:
      throw new Error("unreachable time policy kind");
  }
}

function normalizeLocation(value: unknown, fieldName: string): LocationState {
  const location = assertRecord(value, fieldName);
  return {
    region: assertString(location["region"], `${fieldName}.region`),
    site: assertString(location["site"], `${fieldName}.site`),
    detail: assertString(location["detail"], `${fieldName}.detail`),
    boundary: assertOneOf(location["boundary"], `${fieldName}.boundary`, BOUNDARIES),
  };
}
