import { getState, sessionKey, toSessionEntry } from "./state";

export function persistCurrentState(sessionManager: unknown): void {
  const writer = asStateSessionWriter(sessionManager);
  if (writer === undefined) {
    return;
  }
  writer.appendCustomEntry(sessionKey(), toSessionEntry(getState()));
}

interface StateSessionWriter {
  appendCustomEntry(customType: string, data?: unknown): string;
}

function asStateSessionWriter(value: unknown): StateSessionWriter | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const appendCustomEntry = value["appendCustomEntry"];
  if (typeof appendCustomEntry !== "function") {
    return undefined;
  }
  return {
    appendCustomEntry: (customType: string, data?: unknown) => {
      const result: unknown = appendCustomEntry.call(value, customType, data);
      if (typeof result !== "string") {
        throw new Error("appendCustomEntry returned a non-string entry id.");
      }
      return result;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
