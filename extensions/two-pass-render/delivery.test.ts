import type { AgentEndEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { DirectionPacket } from "../../engine/render/packet-schema.ts";
import type { TwoPassRenderLifecycleApi } from "./index.ts";
import type { PendingProseDelivery } from "./prose-delivery.ts";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import test from "node:test";

import {
  PROSE_CUSTOM_TYPE,
  rendererModeForMessages,
  SUBMIT_DIRECTION_PACKET_TOOL,
} from "../../engine/render/render-turn.ts";
import { deliverSettledProse, registerTwoPassRenderLifecycle } from "./index.ts";
import { createProseDelivery, createSettledProseDelivery } from "./prose-delivery.ts";
import { sessionEntriesToRendererMessages } from "./reroll.ts";

const RENDER_PACKET: DirectionPacket = {
  needsRender: true,
  playerAction: "下达突进指令",
  resolvedChanges: ["Saber 突进受阻"],
  npcStances: [],
  sensoryAnchors: ["灼热气浪"],
  endWindow: "玩家必须创造破绽",
  eventWeight: "normal",
  canonFacts: [],
  suggestedActions: [{ submitText: "寻找侧翼" }],
};

interface SentMessage {
  message: {
    customType: string;
    content: unknown;
    display?: boolean;
    details?: unknown;
  };
  options?: {
    triggerTurn?: boolean;
    deliverAs?: "steer" | "followUp" | "nextTurn";
  };
}

void test("prose delivery persists the packet call id for every outcome", () => {
  assert.deepEqual(
    createProseDelivery({ needsRender: false, directReply: "这是场外回答。" }, "direct-call"),
    {
      text: "这是场外回答。",
      details: { kind: "direct-reply", toolCallId: "direct-call" },
    },
  );
  assert.deepEqual(createProseDelivery(RENDER_PACKET, "fallback-call"), {
    text: [
      "（渲染器暂不可用，以下为本轮结算摘要）",
      "",
      "- Saber 突进受阻",
      "",
      "> 玩家必须创造破绽",
    ].join("\n"),
    details: { kind: "render-fallback", toolCallId: "fallback-call" },
  });
  assert.deepEqual(
    createProseDelivery(RENDER_PACKET, "render-call", {
      text: "渲染正文。",
      lintRuleIds: ["style-rule"],
    }),
    {
      text: "渲染正文。",
      details: {
        kind: "rendered",
        toolCallId: "render-call",
        lintRuleIds: ["style-rule"],
        suggestedActions: [{ submitText: "寻找侧翼" }],
      },
    },
  );
});

void test("settled prose delivery preserves queued continuations and delivers them once", () => {
  const proseDelivery = createSettledProseDelivery();
  const delivered: PendingProseDelivery[] = [];
  const first = createProseDelivery(
    { needsRender: false, directReply: "第一轮正文。" },
    "direct-call",
  );
  const second = createProseDelivery(RENDER_PACKET, "fallback-call");

  proseDelivery.queue(first);
  proseDelivery.queue(second);
  assert.equal(delivered.length, 0);

  proseDelivery.settle((delivery) => delivered.push(delivery));
  assert.deepEqual(delivered, [first, second]);

  proseDelivery.settle((delivery) => delivered.push(delivery));
  assert.equal(delivered.length, 2);
});

void test("settled rendered prose forwards suggested actions and clears its preview", () => {
  const proseDelivery = createSettledProseDelivery();
  const sent: SentMessage[] = [];
  const choices: unknown[] = [];
  let clearCount = 0;
  proseDelivery.queue(
    createProseDelivery(RENDER_PACKET, "render-call", {
      text: "渲染正文。",
      lintRuleIds: ["style-rule"],
    }),
  );

  deliverSettledProse(
    {
      sendMessage(message, options): void {
        sent.push({ message, options });
      },
    },
    proseDelivery,
    (actions) => choices.push(actions),
    () => {
      clearCount += 1;
    },
  );

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]?.options, { triggerTurn: false });
  assert.deepEqual(choices, [[{ submitText: "寻找侧翼" }]]);
  assert.equal(clearCount, 1);
});

void test("renderer history uses the active session branch after settlement projection removes prose", () => {
  const sessionManager = SessionManager.inMemory();
  sessionManager.appendCustomMessageEntry(PROSE_CUSTOM_TYPE, "上一轮已经渲染的正文。", true, {
    kind: "rendered",
  });

  const messages = sessionEntriesToRendererMessages(sessionManager.getBranch());

  assert.equal(rendererModeForMessages(messages), "continuation");
  assert.equal(messages.length, 1);
});

void test("two-pass lifecycle appends a packet once on agent_settled and cleans widgets", async () => {
  let agentEnd: Parameters<TwoPassRenderLifecycleApi["onAgentEnd"]>[0] | undefined;
  let agentSettled: Parameters<TwoPassRenderLifecycleApi["onAgentSettled"]>[0] | undefined;
  const sent: SentMessage[] = [];
  const widgets: Array<{ key: string; value: unknown }> = [];
  registerTwoPassRenderLifecycle({
    onAgentEnd(handler): void {
      agentEnd = handler;
    },
    onAgentSettled(handler): void {
      agentSettled = handler;
    },
    sendMessage(message, options): void {
      sent.push({ message, options });
    },
  });

  assert.ok(agentEnd);
  assert.ok(agentSettled);

  const sessionManager = SessionManager.inMemory();
  const contextSessionManager: ExtensionContext["sessionManager"] = sessionManager;
  const hasUI: boolean = true;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This direct-reply seam reads only session history, hasUI, isIdle, and ui.setWidget; constructing unrelated runtime registries would obscure the behavior under test.
  const ctx = {
    sessionManager: contextSessionManager,
    hasUI,
    isIdle: () => false,
    ui: {
      setWidget(key: string, value: unknown): void {
        widgets.push({ key, value });
      },
    },
  } as ExtensionContext;
  const event: AgentEndEvent = {
    type: "agent_end",
    messages: [
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "direct-reply-call",
            name: SUBMIT_DIRECTION_PACKET_TOOL,
            arguments: { needsRender: false, directReply: "这是场外回答。" },
          },
        ],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "test-model",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "toolUse",
        timestamp: 0,
      },
    ],
  };
  const eventMessage = event.messages[0];
  if (eventMessage?.role !== "assistant") {
    throw new Error("expected direct-reply assistant message");
  }
  sessionManager.appendMessage(eventMessage);

  await agentEnd(event, ctx);
  await agentEnd(event, ctx);
  assert.equal(sent.length, 0);

  agentSettled({ type: "agent_settled" }, ctx);
  assert.deepEqual(sent, [
    {
      message: {
        customType: "fsn-prose",
        content: "这是场外回答。",
        display: true,
        details: { kind: "direct-reply", toolCallId: "direct-reply-call" },
      },
      options: { triggerTurn: false },
    },
  ]);
  assert.deepEqual(widgets, [
    { key: "fsn-player-choices", value: undefined },
    { key: "fsn-render-preview", value: undefined },
  ]);

  agentSettled({ type: "agent_settled" }, ctx);
  assert.equal(sent.length, 1);
});
