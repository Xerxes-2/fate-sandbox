import type { ToolResultRetention } from "../../tools/runtime/tool-definition.ts";

import { isRecord } from "../core/utils/typebox-validation.ts";

export type ToolResultRetentionPolicy = (toolName: string) => ToolResultRetention;

interface RetainedWorkflowResult {
  toolCallId: string;
  retention: ToolResultRetention & { kind: "until-tool-call" };
}

/**
 * Build the per-call settlement working set without changing the lossless session log.
 * A tool result becomes stale when a newer player message starts another agent loop;
 * exceptional workflow handoffs remain visible according to their tool-owned lifetime.
 */
export function projectSettlementWorkingSet<TMessage>(
  messages: ReadonlyArray<TMessage>,
  retentionFor: ToolResultRetentionPolicy,
): TMessage[] {
  const latestUserIndex = findLatestUserIndex(messages);
  if (latestUserIndex === -1) {
    return [...messages];
  }

  const retainedCallIds = collectRetainedToolCallIds(messages, retentionFor);
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
  retentionFor: ToolResultRetentionPolicy,
): Set<string> {
  const successfulCallIds = collectSuccessfulToolCallIds(messages);
  const latestByTool = new Map<string, string>();
  let workflowResults: RetainedWorkflowResult[] = [];

  for (const call of collectToolCalls(messages)) {
    if (successfulCallIds.has(call.id)) {
      workflowResults = workflowResults.filter(
        (result) => !result.retention.terminalTools.includes(call.name),
      );
    }

    const retention = retentionFor(call.name);
    if (retention.kind === "latest-cross-player-turn") {
      latestByTool.set(call.name, call.id);
    } else if (retention.kind === "until-tool-call") {
      workflowResults.push({ toolCallId: call.id, retention });
    }
  }

  return new Set([...latestByTool.values(), ...workflowResults.map((result) => result.toolCallId)]);
}

function collectSuccessfulToolCallIds(messages: ReadonlyArray<unknown>): Set<string> {
  const successful = new Set<string>();
  for (const message of messages) {
    if (isToolResult(message) && message["isError"] !== true) {
      const callId = toolResultCallId(message);
      if (callId.length > 0) {
        successful.add(callId);
      }
    }
  }
  return successful;
}

function collectToolCalls(messages: ReadonlyArray<unknown>): Array<{ id: string; name: string }> {
  const calls: Array<{ id: string; name: string }> = [];
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
        typeof part["name"] === "string"
      ) {
        calls.push({ id: part["id"], name: part["name"] });
      }
    }
  }
  return calls;
}

function isToolResult(message: unknown): message is Record<string, unknown> {
  return isRecord(message) && message["role"] === "toolResult";
}

function toolResultCallId(message: Record<string, unknown>): string {
  return typeof message["toolCallId"] === "string" ? message["toolCallId"] : "";
}
