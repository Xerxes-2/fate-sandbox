import assert from "node:assert/strict";
import test from "node:test";

import {
  projectSessionChronology,
  PROSE_CUSTOM_TYPE,
  SUBMIT_DIRECTION_PACKET_TOOL,
} from "../session-chronology/session-chronology.ts";
import {
  buildSettlementCompactionSummary as formatSettlementCompactionSummary,
  buildSettlementWorkingSetCapsules as formatSettlementWorkingSetCapsules,
} from "./settlement-compaction.ts";

function userMessage(text: string): Record<string, unknown> {
  return { role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

function skillUserMessage(name: string, args?: string): Record<string, unknown> {
  const block = [
    `<skill name="${name}" location="/game/skills/${name}/SKILL.md">`,
    `References are relative to /game/skills/${name}.`,
    "",
    `# ${name}`,
    "large skill instructions",
    "</skill>",
  ].join("\n");
  return userMessage(args === undefined ? block : `${block}\n\n${args}`);
}

function packetCallMessage(
  args: Record<string, unknown>,
  toolCallId = packetFixtureId(args),
): Record<string, unknown> {
  const packetArgs =
    args["needsRender"] === true
      ? {
          resolvedChanges: ["变化"],
          npcStances: [],
          sensoryAnchors: ["锚点"],
          endWindow: "下一步",
          eventWeight: "normal",
          canonFacts: [],
          ...args,
        }
      : args;
  return {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: toolCallId,
        name: SUBMIT_DIRECTION_PACKET_TOOL,
        arguments: packetArgs,
      },
    ],
    timestamp: 0,
  };
}

function packetFixtureId(args: Record<string, unknown>): string {
  const label =
    typeof args["playerAction"] === "string"
      ? args["playerAction"]
      : typeof args["directReply"] === "string"
        ? args["directReply"]
        : "turn";
  return `tc-${label}`;
}

function buildSettlementCompactionSummary(
  messages: ReadonlyArray<unknown>,
  previousSummary: string | undefined,
): string {
  return formatSettlementCompactionSummary(settlementTurns(messages), previousSummary);
}

function buildSettlementWorkingSetCapsules(
  messages: ReadonlyArray<unknown>,
): ReadonlyMap<string, string> {
  return formatSettlementWorkingSetCapsules(settlementTurns(messages));
}

function settlementTurns(messages: ReadonlyArray<unknown>) {
  const acceptedMessages: unknown[] = [];
  for (const message of messages) {
    acceptedMessages.push(message);
    if (!isAssistantPacket(message)) {
      continue;
    }
    for (const part of message.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "id" in part &&
        typeof part.id === "string"
      ) {
        acceptedMessages.push({
          role: "toolResult",
          toolCallId: part.id,
          toolName: SUBMIT_DIRECTION_PACKET_TOOL,
          isError: false,
        });
      }
    }
  }
  const projection = projectSessionChronology(
    { kind: "messages", messages: acceptedMessages },
    { kind: "settlement" },
  );
  if (projection.kind !== "ready") {
    assert.fail(`unexpected chronology anomalies: ${JSON.stringify(projection.anomalies)}`);
  }
  return projection.value.turns;
}

function isAssistantPacket(
  message: unknown,
): message is { role: "assistant"; content: Array<Record<string, unknown>> } {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    message.role === "assistant" &&
    "content" in message &&
    Array.isArray(message.content)
  );
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
  assert.match(summary, /- 玩家「规则问题：令咒怎么用？」｜meta\/OOC 轮，直答：……/);
});

void test("buildSettlementCompactionSummary folds previous digest lines and caps total", () => {
  const previousLines = Array.from({ length: 170 }, (_, i) => `- 旧轮 ${i + 1}`).join("\n");
  const previous = `[结算上下文截断摘要｜机械生成]\n说明行\n${previousLines}`;
  const summary = buildSettlementCompactionSummary(
    [userMessage("新行动"), packetCallMessage({ needsRender: true, playerAction: "新行动落地" })],
    previous,
  );

  // 170 旧行 + 1 新行 → 保留尾部 160 行，丢弃 11 行
  assert.match(summary, /更早的 11 轮索引已丢弃/);
  assert.doesNotMatch(summary, /- 旧轮 11\n/);
  assert.match(summary, /- 旧轮 170/);
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
  assert.match(summary, /这是一段非常长的玩家输入这是一段非常长的玩家输入/);
});

void test("meta turns retain a bounded direct reply", () => {
  const reply = "令咒可以强化从者、强制命令或实现短距离转移。".repeat(10);
  const summary = buildSettlementCompactionSummary(
    [userMessage("令咒怎么用？"), packetCallMessage({ needsRender: false, directReply: reply })],
    undefined,
  );

  assert.match(summary, /meta\/OOC 轮，直答：令咒可以强化从者/);
  assert.match(summary, /…$/m);
  assert.ok(summary.length < reply.length + 300);
});

void test("skill expansions contribute only invocation and arguments to turn chronology", () => {
  const summary = buildSettlementCompactionSummary(
    [
      skillUserMessage("time-sense", "跳过到第二天"),
      packetCallMessage({
        needsRender: true,
        playerAction: "休息到清晨",
        resolvedChanges: ["时间推进至次日"],
      }),
    ],
    undefined,
  );

  assert.match(summary, /玩家「\/skill:time-sense 跳过到第二天」/);
  assert.doesNotMatch(summary, /large skill instructions/);
  assert.doesNotMatch(summary, /References are relative/);
});

void test("buildSettlementCompactionSummary includes prose excerpt when prose message exists", () => {
  const summary = buildSettlementCompactionSummary(
    [
      userMessage("抱起她"),
      packetCallMessage(
        {
          needsRender: true,
          playerAction: "Saber offers to carry",
          resolvedChanges: ["princess carry established"],
          npcStances: [],
          sensoryAnchors: ["体温"],
          endWindow: "她如何回应",
          eventWeight: "normal",
          canonFacts: [],
        },
        "carry-call",
      ),
      proseMessage(
        "carry-call",
        "你一手托住膝弯，一手稳住她的后背，站起来的瞬间她整个人的重量压过来。",
      ),
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

function proseMessage(toolCallId: string, text: string): Record<string, unknown> {
  return {
    role: "custom",
    customType: PROSE_CUSTOM_TYPE,
    content: text,
    details: { kind: "rendered", toolCallId },
  };
}

void test("recent turns keep ruling details; older turns collapse to one line", () => {
  const messages: Record<string, unknown>[] = [];
  for (let i = 1; i <= 16; i++) {
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

  // 最近 12 轮（5..16）带细节行；更早（1..4）只有单行索引。
  assert.match(summary, /⌛ 收尾窗口：窗口 16/);
  assert.match(summary, /☰ tohsaka-rin：主动动作 5/);
  assert.doesNotMatch(summary, /⌛ 收尾窗口：窗口 4/);
  assert.doesNotMatch(summary, /☰ tohsaka-rin：主动动作 1$/mu);
  assert.match(summary, /- 玩家「行动 1」/);
});

void test("working-set capsules preserve plot causality without replay-only packet fields", () => {
  const messages: Record<string, unknown>[] = [];
  for (let index = 1; index <= 14; index++) {
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
          npcOmissions: [
            {
              actorId: "quiet-npc",
              reasonCode: "watching-silently",
              playerSafeNote: `静置表现 ${index}`,
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

  assert.equal(capsules.size, 14);
  assert.match(capsules.get("packet-14") ?? "", /玩家「行动 14」｜行动 14 落地→ 变化 14/);
  assert.match(capsules.get("packet-14") ?? "", /收尾窗口：窗口 14/);
  assert.match(capsules.get("packet-14") ?? "", /npc：主动动作 14/);
  assert.match(capsules.get("packet-14") ?? "", /quiet-npc（watching-silently）：静置表现 14/);
  assert.doesNotMatch(capsules.get("packet-14") ?? "", /只供渲染的意象/);
  assert.doesNotMatch(capsules.get("packet-14") ?? "", /只供渲染的原作事实/);
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
