import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { hydrateState, sessionKey } from "./state";

export function hydrateStateFromSessionEntries(entries: readonly SessionEntry[]): boolean {
  for (let index = entries.length - 1; index >= 0; index--) {
    const rawState = extractState(entries[index]);
    if (rawState !== undefined) {
      hydrateState(rawState);
      return true;
    }
  }
  return false;
}

function extractState(entry: SessionEntry | undefined): unknown {
  if (entry === undefined) {
    return undefined;
  }
  if (entry.type === "custom" && entry.customType === sessionKey()) {
    return extractStateFromSessionData(entry.data);
  }
  if (entry.type === "message" && entry.message.role === "toolResult") {
    return extractStateFromSessionData(entry.message.details?.[sessionKey()]);
  }
  return undefined;
}

function extractStateFromSessionData(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return undefined;
  }
  return raw["state"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
