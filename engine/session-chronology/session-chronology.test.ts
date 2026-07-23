import type { RenderDirectionPacket } from "../render/packet-schema.ts";
import type { SessionBranchEntry } from "./session-chronology.ts";

import assert from "node:assert/strict";
import test from "node:test";

import {
  projectSessionChronology,
  PROSE_CUSTOM_TYPE,
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

function packetCall(toolCallId: string, packet: unknown = RENDER_PACKET): Record<string, unknown> {
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
  return {
    role: "toolResult",
    toolCallId,
    toolName: SUBMIT_DIRECTION_PACKET_TOOL,
    isError: false,
    content: "accepted",
  };
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
): SessionBranchEntry & Record<string, unknown> {
  return { type: "message", id, parentId, timestamp: "2026-07-22T00:00:00.000Z", message };
}

function proseEntry(
  id: string,
  parentId: string | null,
  toolCallId: string,
  text: string,
): SessionBranchEntry & Record<string, unknown> {
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

void test("packet lifecycle ordering rejects results and deliveries that precede their cause", () => {
  const resultBeforeCall = projectSessionChronology(
    {
      kind: "messages",
      messages: [acceptedResult("packet-1"), userMessage("调查"), packetCall("packet-1")],
    },
    { kind: "render" },
  );
  const deliveryBeforeResult = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("调查"),
        packetCall("packet-1"),
        proseMessage("packet-1", "提前出现的正文。"),
        acceptedResult("packet-1"),
      ],
    },
    { kind: "render" },
  );

  assert.equal(resultBeforeCall.kind, "blocked");
  assert.ok(
    resultBeforeCall.anomalies.some((anomaly) => anomaly.kind === "packet-result-before-call"),
  );
  assert.equal(deliveryBeforeResult.kind, "blocked");
  assert.ok(
    deliveryBeforeResult.anomalies.some(
      (anomaly) => anomaly.kind === "delivery-before-packet-result",
    ),
  );
});

void test("packet results must name submit_direction_packet and orphan results remain visible", () => {
  const wrongTool = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("调查"),
        packetCall("packet-1"),
        {
          role: "toolResult",
          toolCallId: "packet-1",
          toolName: "lookup",
          isError: false,
        },
      ],
    },
    { kind: "render" },
  );
  const orphan = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        {
          role: "toolResult",
          toolCallId: "packet-orphan",
          toolName: SUBMIT_DIRECTION_PACKET_TOOL,
          isError: false,
        },
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(wrongTool.kind, "blocked");
  assert.ok(wrongTool.anomalies.some((anomaly) => anomaly.kind === "packet-result-tool-mismatch"));
  assert.equal(orphan.kind, "blocked");
  assert.ok(orphan.anomalies.some((anomaly) => anomaly.kind === "orphan-packet-result"));
});

void test("duplicate results and deliveries produce explicit anomalies", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("调查"),
        packetCall("packet-1"),
        acceptedResult("packet-1"),
        acceptedResult("packet-1"),
        proseMessage("packet-1", "第一份正文。"),
        proseMessage("packet-1", "第二份正文。"),
      ],
    },
    { kind: "render" },
  );

  assert.equal(result.kind, "blocked");
  assert.ok(result.anomalies.some((anomaly) => anomaly.kind === "duplicate-packet-result"));
  assert.ok(result.anomalies.some((anomaly) => anomaly.kind === "duplicate-delivery"));
});

void test("multiple accepted packets inside one player turn are rejected", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("行动"),
        packetCall("packet-1"),
        acceptedResult("packet-1"),
        packetCall("packet-2"),
        acceptedResult("packet-2"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(result.kind, "blocked");
  assert.ok(result.anomalies.some((anomaly) => anomaly.kind === "multiple-accepted-packets"));
});

void test("a new player boundary discards abandoned input before the next accepted turn", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("已放弃行动"),
        packetCall("abandoned"),
        userMessage("当前行动"),
        packetCall("current"),
        acceptedResult("current"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") {
    assert.fail("expected ready settlement projection");
  }
  assert.equal(result.value.turns[0]?.playerInput, "当前行动");
});

void test("packet results and deliveries cannot cross the next player-turn boundary", () => {
  const lateResult = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("旧行动"),
        packetCall("packet-1"),
        userMessage("新行动"),
        acceptedResult("packet-1"),
      ],
    },
    { kind: "settlement" },
  );
  const lateDelivery = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("旧行动"),
        packetCall("packet-1"),
        acceptedResult("packet-1"),
        userMessage("新行动"),
        proseMessage("packet-1", "迟到的旧正文。"),
      ],
    },
    { kind: "render" },
  );

  assert.equal(lateResult.kind, "blocked");
  assert.ok(
    lateResult.anomalies.some((anomaly) => anomaly.kind === "packet-result-crosses-turn-boundary"),
  );
  assert.equal(lateDelivery.kind, "blocked");
  assert.ok(
    lateDelivery.anomalies.some((anomaly) => anomaly.kind === "delivery-crosses-turn-boundary"),
  );
});

void test("an image-only user message is still a player-turn boundary", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("旧行动"),
        packetCall("packet-1"),
        { role: "user", content: [{ type: "image", data: "ignored" }] },
        acceptedResult("packet-1"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(result.kind, "blocked");
  assert.ok(
    result.anomalies.some((anomaly) => anomaly.kind === "packet-result-crosses-turn-boundary"),
  );
});

void test("malformed packet arguments and contradictory results are anomalies", () => {
  const malformed = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("调查"),
        packetCall("packet-1", "not-an-object"),
        acceptedResult("packet-1"),
      ],
    },
    { kind: "settlement" },
  );
  const contradictory = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("调查"),
        packetCall("packet-1"),
        { ...acceptedResult("packet-1"), isError: true },
        acceptedResult("packet-1"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(malformed.kind, "blocked");
  assert.ok(malformed.anomalies.some((anomaly) => anomaly.kind === "invalid-direction-packet"));
  assert.equal(contradictory.kind, "blocked");
  assert.ok(contradictory.anomalies.some((anomaly) => anomaly.kind === "duplicate-packet-result"));
});

void test("a superseded awaiting delivery stays auditable but is never actionable", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("旧行动"),
        packetCall("packet-1"),
        acceptedResult("packet-1"),
        userMessage("新行动"),
        packetCall("packet-2"),
        acceptedResult("packet-2"),
        proseMessage("packet-2", "新行动正文。"),
      ],
    },
    { kind: "render" },
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") {
    assert.fail("expected ready render projection");
  }
  assert.equal(result.value.awaitingDelivery, undefined);
  assert.equal(result.value.latestNarrativeProse, "新行动正文。");
  assert.ok(result.anomalies.some((anomaly) => anomaly.kind === "superseded-awaiting-delivery"));
});

void test("delivery anomalies suppress stale settlement continuity without blocking turns", () => {
  const result = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("第一轮"),
        packetCall("packet-1"),
        acceptedResult("packet-1"),
        proseMessage("packet-1", "第一轮正文。"),
        proseMessage(undefined, "无法关联的新正文。"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") {
    assert.fail("expected settlement projection to remain available");
  }
  assert.equal(result.value.latestNarrativeProse, undefined);
});

void test("orphan and mismatched deliveries are explicit and do not rewrite settlement turns", () => {
  const orphan = projectSessionChronology(
    {
      kind: "messages",
      messages: [proseMessage("missing", "孤立正文。")],
    },
    { kind: "settlement" },
  );
  const mismatch = projectSessionChronology(
    {
      kind: "messages",
      messages: [
        userMessage("规则问题"),
        packetCall("direct-1", { needsRender: false, directReply: "回答。" }),
        acceptedResult("direct-1"),
        proseMessage("direct-1", "错误的叙事正文。"),
      ],
    },
    { kind: "settlement" },
  );

  assert.equal(orphan.kind, "ready");
  assert.ok(orphan.anomalies.some((anomaly) => anomaly.kind === "orphan-delivery"));
  assert.equal(mismatch.kind, "ready");
  assert.ok(mismatch.anomalies.some((anomaly) => anomaly.kind === "delivery-kind-mismatch"));
  if (mismatch.kind !== "ready") {
    assert.fail("expected settlement projection to remain available");
  }
  assert.equal(mismatch.value.turns[0]?.status, "awaiting-delivery");
});

void test("branch anomalies preserve the offending Session Log entry identity", () => {
  const result = projectSessionChronology(
    {
      kind: "session-branch",
      entries: [proseEntry("bad-prose", null, "missing", "孤立正文。")],
    },
    { kind: "reroll" },
  );

  assert.equal(result.kind, "blocked");
  const anomaly = result.anomalies.find((entry) => entry.kind === "orphan-delivery");
  assert.equal(anomaly?.entryId, "bad-prose");
  assert.equal(anomaly?.parentId, null);
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
