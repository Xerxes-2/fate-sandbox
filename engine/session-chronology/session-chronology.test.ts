import type { RenderDirectionPacket } from "../render/packet-schema.ts";

import assert from "node:assert/strict";
import test from "node:test";

import {
  PROSE_CUSTOM_TYPE,
  projectSessionChronology,
  SUBMIT_DIRECTION_PACKET_TOOL,
} from "./session-chronology.ts";

const RENDER_PACKET: RenderDirectionPacket = {
  needsRender: true,
  playerAction: "调查祭坛",
  resolvedChanges: ["发现祭坛背面有新鲜划痕"],
  npcStances: [],
  sensoryAnchors: ["冷灰尘"],
  endWindow: "划痕延伸到石板缝隙里。",
  eventWeight: "normal",
  canonFacts: [],
};

function userMessage(text: string): Record<string, unknown> {
  return { role: "user", content: [{ type: "text", text }] };
}

function packetCall(
  toolCallId: string,
  packet: Record<string, unknown> = RENDER_PACKET,
): Record<string, unknown> {
  return {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: toolCallId,
        name: SUBMIT_DIRECTION_PACKET_TOOL,
        arguments: packet,
      },
    ],
  };
}

function acceptedResult(toolCallId: string): Record<string, unknown> {
  return { role: "toolResult", toolCallId, isError: false, content: "accepted" };
}

function proseMessage(
  toolCallId: string | undefined,
  text: string,
  kind = "rendered",
): Record<string, unknown> {
  return {
    role: "custom",
    customType: PROSE_CUSTOM_TYPE,
    content: text,
    details: { kind, ...(toolCallId === undefined ? {} : { toolCallId }) },
  };
}

function branchEntry(
  id: string,
  parentId: string | null,
  message: Record<string, unknown>,
): Record<string, unknown> {
  return { type: "message", id, parentId, timestamp: "2026-07-22T00:00:00.000Z", message };
}

function proseEntry(
  id: string,
  parentId: string | null,
  toolCallId: string,
  text: string,
): Record<string, unknown> {
  return {
    type: "custom_message",
    id,
    parentId,
    timestamp: "2026-07-22T00:00:00.000Z",
    customType: PROSE_CUSTOM_TYPE,
    content: text,
    display: true,
    details: { kind: "rendered", toolCallId },
  };
}

void test("message and Session Log branch adapters produce the same narrative chronology", () => {
  const messages = [
    userMessage("调查祭坛"),
    packetCall("packet-1"),
    acceptedResult("packet-1"),
    proseMessage("packet-1", "灰尘下露出一道新鲜划痕。"),
  ];
  const branch = [
    branchEntry("u1", null, messages[0] ?? {}),
    branchEntry("a1", "u1", messages[1] ?? {}),
    branchEntry("r1", "a1", messages[2] ?? {}),
    proseEntry("p1", "r1", "packet-1", "灰尘下露出一道新鲜划痕。"),
  ];

  const fromMessages = projectSessionChronology({ kind: "messages", messages }, { kind: "render" });
  const fromBranch = projectSessionChronology(
    { kind: "session-branch", entries: branch },
    { kind: "render" },
  );

  assert.equal(fromMessages.kind, "ready");
  assert.equal(fromBranch.kind, "ready");
  if (fromMessages.kind !== "ready" || fromBranch.kind !== "ready") {
    assert.fail("expected ready render projections");
  }
  assert.deepEqual(fromBranch.value, fromMessages.value);
  assert.equal(fromMessages.value.mode, "continuation");
  assert.equal(fromMessages.value.turns[0]?.playerInput, "调查祭坛");
  assert.equal(fromMessages.value.latestNarrativeProse, "灰尘下露出一道新鲜划痕。");
});

void test("render projection separates Direct Turns and exposes the latest accepted turn awaiting delivery", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("规则问题"),
        packetCall("direct-1", { needsRender: false, directReply: "这是规则回答。" }),
        acceptedResult("direct-1"),
        proseMessage("direct-1", "这是规则回答。", "direct-reply"),
        userMessage("继续调查"),
        packetCall("packet-2"),
        acceptedResult("packet-2"),
      ],
    },
    { kind: "render" },
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") {
    assert.fail("expected ready render projection");
  }
  assert.equal(result.value.mode, "opening");
  assert.deepEqual(result.value.turns, []);
  assert.equal(result.value.awaitingDelivery?.kind, "narrative");
  assert.equal(result.value.awaitingDelivery?.status, "awaiting-delivery");
  assert.equal(result.value.awaitingDelivery?.toolCallId, "packet-2");
  assert.equal(result.value.awaitingDelivery?.playerInput, "继续调查");
});

void test("settlement projection keeps Narrative and Direct Turn variants", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("规则问题"),
        packetCall("direct-1", { needsRender: false, directReply: "规则回答。" }),
        acceptedResult("direct-1"),
        proseMessage("direct-1", "规则回答。", "direct-reply"),
        userMessage("调查"),
        packetCall("packet-2"),
        acceptedResult("packet-2"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") {
    assert.fail("expected ready settlement projection");
  }
  assert.deepEqual(
    result.value.turns.map((turn) => [turn.kind, turn.status]),
    [
      ["direct", "delivered"],
      ["narrative", "awaiting-delivery"],
    ],
  );
});

void test("an unassociated prose blocks render but not the packet-only settlement projection", () => {
  const source = {
    kind: "messages" as const,
    messages: [
      userMessage("调查"),
      packetCall("packet-1"),
      acceptedResult("packet-1"),
      proseMessage(undefined, "没有关联的正文。"),
    ],
  };

  const render = projectSessionChronology(source, { kind: "render" });
  const settlement = projectSessionChronology(source, { kind: "settlement" });

  assert.equal(render.kind, "blocked");
  assert.equal(render.anomalies[0]?.kind, "missing-delivery-tool-call-id");
  assert.equal(settlement.kind, "ready");
  assert.equal(settlement.anomalies[0]?.kind, "missing-delivery-tool-call-id");
  if (settlement.kind !== "ready") {
    assert.fail("expected settlement projection to remain available");
  }
  assert.equal(settlement.value.turns[0]?.status, "awaiting-delivery");
});

void test("reroll projection preserves Session Log identity and removes the target prose from render history", () => {
  const branch = [
    branchEntry("u1", null, userMessage("第一轮")),
    branchEntry("a1", "u1", packetCall("packet-1")),
    branchEntry("r1", "a1", acceptedResult("packet-1")),
    proseEntry("p1", "r1", "packet-1", "第一轮正文。"),
  ];

  const result = projectSessionChronology(
    { kind: "session-branch", entries: branch },
    { kind: "reroll" },
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready" || result.value.kind !== "ready") {
    assert.fail("expected ready reroll projection");
  }
  assert.equal(result.value.proseEntryId, "p1");
  assert.equal(result.value.parentId, "r1");
  assert.equal(result.value.toolCallId, "packet-1");
  assert.deepEqual(result.value.render.turns, []);
  assert.equal(result.value.render.awaitingDelivery?.toolCallId, "packet-1");
});
