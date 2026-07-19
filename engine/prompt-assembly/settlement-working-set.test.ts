import type { ToolResultRetention } from "../../tools/runtime/tool-definition.ts";

import assert from "node:assert/strict";
import test from "node:test";

import { projectSettlementWorkingSet } from "./settlement-working-set.ts";

function user(text: string): Record<string, unknown> {
  return { role: "user", content: [{ type: "text", text }] };
}

function assistantToolCall(id: string, name: string): Record<string, unknown> {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: {} }],
  };
}

function toolResult(id: string, text: string, isError = false): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: id,
    content: [{ type: "text", text }],
    isError,
  };
}

const CURRENT_TURN: ToolResultRetention = { kind: "current-player-turn" };
const RETENTION_FOR = (toolName: string): ToolResultRetention => {
  if (toolName === "audit") {
    return { kind: "latest-cross-player-turn" };
  }
  if (toolName === "harvest") {
    return { kind: "until-tool-call", terminalTools: ["land", "resolve"] };
  }
  return CURRENT_TURN;
};

void test("projectSettlementWorkingSet drops tool results from completed player turns", () => {
  const staleResult = toolResult("old-write", "large mutation receipt");
  const currentResult = toolResult("current-write", "current receipt");
  const messages = [
    user("first turn"),
    assistantToolCall("old-write", "commit_turn"),
    staleResult,
    user("second turn"),
    assistantToolCall("current-write", "commit_turn"),
    currentResult,
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.equal(projected.includes(staleResult), false);
  assert.equal(projected.includes(currentResult), true);
  assert.deepEqual(
    projected.filter((message) => message.role === "user"),
    [messages[0], messages[3]],
  );
});

void test("projectSettlementWorkingSet retains only the latest replaceable handoff", () => {
  const oldAudit = toolResult("audit-old", "old verdict");
  const latestAudit = toolResult("audit-new", "latest verdict");
  const messages = [
    user("first"),
    assistantToolCall("audit-old", "audit"),
    oldAudit,
    user("second"),
    assistantToolCall("audit-new", "audit"),
    latestAudit,
    user("third"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.equal(projected.includes(oldAudit), false);
  assert.equal(projected.includes(latestAudit), true);
});

void test("projectSettlementWorkingSet retains a workflow handoff until successful resolution", () => {
  const handoff = toolResult("harvest-1", "candidate awaiting review");
  const failedResolution = toolResult("land-failed", "invalid event", true);
  const messages = [
    user("first"),
    assistantToolCall("harvest-1", "harvest"),
    handoff,
    user("second"),
    assistantToolCall("land-failed", "land"),
    failedResolution,
    user("third"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.equal(projected.includes(handoff), true);
});

void test("projectSettlementWorkingSet drops a handoff after successful resolution", () => {
  const handoff = toolResult("harvest-1", "candidate awaiting review");
  const messages = [
    user("first"),
    assistantToolCall("harvest-1", "harvest"),
    handoff,
    user("second"),
    assistantToolCall("land-1", "land"),
    toolResult("land-1", "landed"),
    user("third"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.equal(projected.includes(handoff), false);
});

void test("projectSettlementWorkingSet preserves all messages before any player input", () => {
  const messages = [
    assistantToolCall("startup", "commit_turn"),
    toolResult("startup", "startup result"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.deepEqual(projected, messages);
  assert.notEqual(projected, messages);
});

void test("projectSettlementWorkingSet does not mutate the source message array", () => {
  const messages = [user("first"), toolResult("old", "old"), user("second")];
  const snapshot = structuredClone(messages);

  projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.deepEqual(messages, snapshot);
});
