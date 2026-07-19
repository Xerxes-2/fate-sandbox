import assert from "node:assert/strict";
import test from "node:test";

import { SUBMIT_DIRECTION_PACKET_TOOL } from "./render-turn.ts";
import {
  buildSettlementCompactionSummary,
  buildSettlementWorkingSetCapsules,
} from "./settlement-compaction.ts";

function userMessage(text: string): Record<string, unknown> {
  return { role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

function packetCallMessage(
  args: Record<string, unknown>,
  toolCallId = "tc",
): Record<string, unknown> {
  return {
    role: "assistant",
    content: [
      { type: "toolCall", id: toolCallId, name: SUBMIT_DIRECTION_PACKET_TOOL, arguments: args },
    ],
    timestamp: 0,
  };
}

void test("buildSettlementCompactionSummary indexes turns from packet calls", () => {
  const summary = buildSettlementCompactionSummary(
    [
      userMessage("贴上去！"),
      packetCallMessage({
        needsRender: true,
        playerAction: "Saber 突进",
        resolvedChanges: ["受阻", "魔力 -10"],
      }),
      userMessage("规则问题：令咒怎么用？"),
      packetCallMessage({ needsRender: false, directReply: "……" }),
    ],
    undefined,
  );

  assert.match(summary, /\[结算上下文截断摘要/);
  assert.match(summary, /以注入的 state 为准/);
  assert.match(summary, /- 玩家「贴上去！」｜Saber 突进→ 受阻；魔力 -10/);
  assert.match(summary, /- 玩家「规则问题：令咒怎么用？」｜meta\/OOC 轮/);
});

void test("buildSettlementCompactionSummary folds previous digest lines and caps total", () => {
  const previousLines = Array.from({ length: 90 }, (_, i) => `- 旧轮 ${i + 1}`).join("\n");
  const previous = `[结算上下文截断摘要｜机械生成]\n说明行\n${previousLines}`;
  const summary = buildSettlementCompactionSummary(
    [userMessage("新行动"), packetCallMessage({ needsRender: true, playerAction: "新行动落地" })],
    previous,
  );

  // 90 旧行 + 1 新行 → 保留尾部 80 行，丢弃 11 行
  assert.match(summary, /更早的 11 轮索引已丢弃/);
  assert.doesNotMatch(summary, /- 旧轮 11\n/);
  assert.match(summary, /- 旧轮 90/);
  assert.match(summary, /- 玩家「新行动」｜新行动落地/);
  assert.doesNotMatch(summary, /说明行/);
});

void test("buildSettlementCompactionSummary is deterministic", () => {
  const messages = [
    userMessage("行动"),
    packetCallMessage({ needsRender: true, playerAction: "落地" }),
  ];
  assert.equal(
    buildSettlementCompactionSummary(messages, undefined),
    buildSettlementCompactionSummary(messages, undefined),
  );
});

void test("long player input is excerpted", () => {
  const summary = buildSettlementCompactionSummary(
    [
      userMessage("这是一段非常长的玩家输入".repeat(10)),
      packetCallMessage({ needsRender: true, playerAction: "行动" }),
    ],
    undefined,
  );
  assert.match(summary, /…」/);
});

void test("buildSettlementCompactionSummary includes prose excerpt when prose message exists", () => {
  const summary = buildSettlementCompactionSummary(
    [
      userMessage("抱起她"),
      proseMessage("你一手托住膝弯，一手稳住她的后背，站起来的瞬间她整个人的重量压过来。"),
      packetCallMessage({
        needsRender: true,
        playerAction: "Saber offers to carry",
        resolvedChanges: ["princess carry established"],
      }),
    ],
    undefined,
  );

  assert.match(summary, /▸ 正文：/);
  assert.match(summary, /一手托住膝弯/);
});

void test("buildSettlementCompactionSummary omits prose marker when no prose message", () => {
  const summary = buildSettlementCompactionSummary(
    [userMessage("行动"), packetCallMessage({ needsRender: true, playerAction: "行动落地" })],
    undefined,
  );

  assert.doesNotMatch(summary, /▸ 正文/);
});

function proseMessage(text: string): Record<string, unknown> {
  return { role: "custom", customType: "fsn-prose", content: text };
}

void test("recent turns keep ruling details; older turns collapse to one line", () => {
  const messages: Record<string, unknown>[] = [];
  for (let i = 1; i <= 10; i++) {
    messages.push(
      userMessage(`行动 ${i}`),
      packetCallMessage({
        needsRender: true,
        playerAction: `行动 ${i} 落地`,
        resolvedChanges: [`变化 ${i}`],
        endWindow: `窗口 ${i}`,
        npcStances: [
          {
            actorId: "tohsaka-rin",
            stance: "警惕",
            wants: "情报",
            move: `主动动作 ${i}`,
            refusesToSay: "家族目标",
          },
        ],
      }),
    );
  }
  const summary = buildSettlementCompactionSummary(messages, undefined);

  // 最近 6 轮（5..10）带细节行；更早（1..4）只有单行索引。
  assert.match(summary, /⌛ 收尾窗口：窗口 10/);
  assert.match(summary, /☰ tohsaka-rin：主动动作 5/);
  assert.doesNotMatch(summary, /⌛ 收尾窗口：窗口 4/);
  assert.doesNotMatch(summary, /☰ tohsaka-rin：主动动作 1$/mu);
  assert.match(summary, /- 玩家「行动 1」/);
});

void test("working-set capsules preserve plot causality without replay-only packet fields", () => {
  const messages: Record<string, unknown>[] = [];
  for (let index = 1; index <= 8; index++) {
    messages.push(
      userMessage(`行动 ${index}`),
      packetCallMessage(
        {
          needsRender: true,
          playerAction: `行动 ${index} 落地`,
          resolvedChanges: [`变化 ${index}`],
          endWindow: `窗口 ${index}`,
          npcStances: [
            {
              actorId: "npc",
              stance: "警惕",
              wants: "情报",
              move: `主动动作 ${index}`,
              refusesToSay: "秘密",
            },
          ],
          sensoryAnchors: [`只供渲染的意象 ${index}`],
          canonFacts: [`只供渲染的原作事实 ${index}`],
        },
        `packet-${index}`,
      ),
    );
  }

  const capsules = buildSettlementWorkingSetCapsules(messages);

  assert.equal(capsules.size, 8);
  assert.match(capsules.get("packet-8") ?? "", /玩家「行动 8」｜行动 8 落地→ 变化 8/);
  assert.match(capsules.get("packet-8") ?? "", /收尾窗口：窗口 8/);
  assert.match(capsules.get("packet-8") ?? "", /npc：主动动作 8/);
  assert.doesNotMatch(capsules.get("packet-8") ?? "", /只供渲染的意象/);
  assert.doesNotMatch(capsules.get("packet-8") ?? "", /只供渲染的原作事实/);
  assert.doesNotMatch(capsules.get("packet-2") ?? "", /收尾窗口/);
});

void test("detail lines degrade to one-line index when folded through a second compaction", () => {
  const first = buildSettlementCompactionSummary(
    [
      userMessage("夜巡"),
      packetCallMessage({
        needsRender: true,
        playerAction: "夜巡落地",
        resolvedChanges: ["发现结界"],
        endWindow: "撤回据点前",
      }),
    ],
    undefined,
  );
  assert.match(first, /⌛ 收尾窗口：撤回据点前/);

  const second = buildSettlementCompactionSummary([], first);
  // 折叠只保留 "- " 索引行：细节行消失，索引行保留。
  assert.doesNotMatch(second, /⌛ 收尾窗口/);
  assert.match(second, /- 玩家「夜巡」｜夜巡落地→ 发现结界/);
});
