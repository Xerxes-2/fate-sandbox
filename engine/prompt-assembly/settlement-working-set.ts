import { isRecord } from "../core/utils/typebox-validation.ts";

export type CrossTurnToolResultPolicy = (toolName: string) => boolean;

/**
 * Build the per-call settlement working set without changing the lossless session log.
 * A tool result becomes stale when a newer player message starts another agent loop;
 * exceptional workflow handoffs remain visible until their domain state can own them.
 */
export function projectSettlementWorkingSet<TMessage>(
  messages: ReadonlyArray<TMessage>,
  retainAcrossTurns: CrossTurnToolResultPolicy,
): TMessage[] {
  const latestUserIndex = findLatestUserIndex(messages);
  if (latestUserIndex === -1) {
    return [...messages];
  }

  const retainedCallIds = collectRetainedToolCallIds(messages, retainAcrossTurns);
  return messages.filter(
    (message, index) =>
      index >= latestUserIndex ||
      !isToolResult(message) ||
      retainedCallIds.has(toolResultCallId(message)),
  );
}

function findLatestUserIndex(messages: ReadonlyArray<unknown>): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (isRecord(message) && message["role"] === "user") {
      return index;
    }
  }
  return -1;
}

function collectRetainedToolCallIds(
  messages: ReadonlyArray<unknown>,
  retainAcrossTurns: CrossTurnToolResultPolicy,
): Set<string> {
  const retained = new Set<string>();
  for (const message of messages) {
    if (!isRecord(message) || message["role"] !== "assistant") {
      continue;
    }
    const content = message["content"];
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (
        isRecord(part) &&
        part["type"] === "toolCall" &&
        typeof part["id"] === "string" &&
        typeof part["name"] === "string" &&
        retainAcrossTurns(part["name"])
      ) {
        retained.add(part["id"]);
      }
    }
  }
  return retained;
}

function isToolResult(message: unknown): message is Record<string, unknown> {
  return isRecord(message) && message["role"] === "toolResult";
}

function toolResultCallId(message: Record<string, unknown>): string {
  return typeof message["toolCallId"] === "string" ? message["toolCallId"] : "";
}
