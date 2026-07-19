import type { ToolResultRetention } from "../../tools/runtime/tool-definition.ts";

import { isRecord } from "../core/utils/typebox-validation.ts";
import { buildSettlementWorkingSetCapsules } from "../render/settlement-compaction.ts";

export type ToolResultRetentionPolicy = (toolName: string) => ToolResultRetention;

interface RetainedWorkflowResult {
  toolCallId: string;
  retention: ToolResultRetention & { kind: "until-tool-call" };
}

/**
 * Build the per-call settlement working set without changing the lossless session log.
 * Projection changes only at a player-message boundary: the active agent loop remains byte-stable,
 * while completed turns lose scratch thinking, stale receipts, and replay-only tool arguments.
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
  const capsules = buildSettlementWorkingSetCapsules(messages.slice(0, latestUserIndex));
  const projected: TMessage[] = [];

  messages.forEach((message, index) => {
    if (index >= latestUserIndex) {
      projected.push(message);
      return;
    }
    const staleMessage = projectCompletedTurnMessage(message, retainedCallIds, capsules);
    if (staleMessage !== undefined) {
      projected.push(staleMessage);
    }
  });
  return projected;
}

function projectCompletedTurnMessage<TMessage>(
  message: TMessage,
  retainedCallIds: ReadonlySet<string>,
  capsules: ReadonlyMap<string, string>,
): TMessage | undefined {
  if (isToolResult(message)) {
    return retainedCallIds.has(toolResultCallId(message)) ? message : undefined;
  }
  if (!isRecord(message) || message["role"] !== "assistant") {
    return message;
  }
  const content = message["content"];
  if (!Array.isArray(content)) {
    return message;
  }

  const projectedContent: unknown[] = [];
  for (const part of content) {
    if (!isRecord(part)) {
      projectedContent.push(part);
      continue;
    }
    if (part["type"] === "thinking") {
      continue;
    }
    if (part["type"] !== "toolCall") {
      projectedContent.push(part);
      continue;
    }

    const callId = typeof part["id"] === "string" ? part["id"] : "";
    const capsule = capsules.get(callId);
    if (capsule !== undefined) {
      projectedContent.push({ type: "text", text: capsule });
    } else if (retainedCallIds.has(callId)) {
      projectedContent.push(retainedToolCallShell(part));
    }
  }

  if (projectedContent.length === 0) {
    return undefined;
  }
  return replaceMessageContent(message, projectedContent);
}

function retainedToolCallShell(part: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "toolCall",
    id: part["id"],
    name: part["name"],
    arguments: {},
  };
}

function replaceMessageContent<TMessage>(message: TMessage, content: unknown[]): TMessage {
  return { ...message, content };
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
