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

function toolResult(id: string, text: string): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: id,
    content: [{ type: "text", text }],
  };
}

const RETAIN_CROSS_TURN = (toolName: string): boolean => toolName === "workflow_handoff";

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

  const projected = projectSettlementWorkingSet(messages, RETAIN_CROSS_TURN);

  assert.equal(projected.includes(staleResult), false);
  assert.equal(projected.includes(currentResult), true);
  assert.deepEqual(
    projected.filter((message) => message.role === "user"),
    [messages[0], messages[3]],
  );
});

void test("projectSettlementWorkingSet retains declared cross-turn workflow handoffs", () => {
  const handoff = toolResult("handoff", "candidate awaiting review");
  const messages = [
    user("first turn"),
    assistantToolCall("handoff", "workflow_handoff"),
    handoff,
    user("second turn"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETAIN_CROSS_TURN);

  assert.equal(projected.includes(handoff), true);
});

void test("projectSettlementWorkingSet preserves all messages before any player input", () => {
  const messages = [
    assistantToolCall("startup", "commit_turn"),
    toolResult("startup", "startup result"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETAIN_CROSS_TURN);

  assert.deepEqual(projected, messages);
  assert.notEqual(projected, messages);
});

void test("projectSettlementWorkingSet does not mutate the source message array", () => {
  const messages = [user("first"), toolResult("old", "old"), user("second")];
  const snapshot = structuredClone(messages);

  projectSettlementWorkingSet(messages, RETAIN_CROSS_TURN);

  assert.deepEqual(messages, snapshot);
});
