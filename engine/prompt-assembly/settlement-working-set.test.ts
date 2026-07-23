import type { ToolResultRetention } from "../../tools/runtime/tool-definition.ts";

import assert from "node:assert/strict";
import test from "node:test";

import { projectSettlementWorkingSet } from "./settlement-working-set.ts";

function user(text: string): Record<string, unknown> {
  return { role: "user", content: [{ type: "text", text }] };
}

function skillUser(name: string, args?: string): Record<string, unknown> {
  const block = [
    `<skill name="${name}" location="/game/skills/${name}/SKILL.md">`,
    `References are relative to /game/skills/${name}.`,
    "",
    `# ${name}`,
    "large skill instructions",
    "</skill>",
  ].join("\n");
  return user(args === undefined ? block : `${block}\n\n${args}`);
}

function assistantToolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {},
): Record<string, unknown> {
  const toolArgs =
    name === "submit_direction_packet" && args["needsRender"] === true
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
      { type: "thinking", thinking: "scratch reasoning" },
      { type: "toolCall", id, name, arguments: toolArgs },
    ],
  };
}

function toolResult(
  id: string,
  text: string,
  isError = false,
  toolName?: string,
): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: id,
    content: [{ type: "text", text }],
    isError,
    ...(toolName === undefined ? {} : { toolName }),
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
  assert.deepEqual(projected[projected.indexOf(latestAudit) - 1]?.content, [
    { type: "toolCall", id: "audit-new", name: "audit", arguments: {} },
  ]);
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

void test("projectSettlementWorkingSet replaces completed packets with stable plot capsules", () => {
  const oldPacket = assistantToolCall("packet-1", "submit_direction_packet", {
    needsRender: true,
    playerAction: "拒绝交出信件",
    resolvedChanges: ["谈判破裂", "监察者转为跟踪"],
    endWindow: "巷口出现第二组脚步声",
    npcStances: [
      {
        actorId: "inspector",
        stance: "强硬",
        wants: "夺取信件",
        move: "命令部下封住巷口",
        refusesToSay: "雇主身份",
      },
    ],
    sensoryAnchors: ["潮湿砖墙"],
    canonFacts: ["一次性渲染事实"],
  });
  const currentUser = user("翻过围墙");
  const messages = [
    user("不交"),
    oldPacket,
    toolResult("packet-1", "accepted", false, "submit_direction_packet"),
    currentUser,
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);
  const capsuleMessage = projected[1];

  assert.notEqual(capsuleMessage, oldPacket);
  assert.deepEqual(capsuleMessage?.content, [
    {
      type: "text",
      text: [
        "[已结算剧情胶囊｜机械生成]",
        "- 玩家「不交」｜拒绝交出信件→ 谈判破裂；监察者转为跟踪",
        "  ⌛ 收尾窗口：巷口出现第二组脚步声",
        "  ☰ inspector：命令部下封住巷口",
      ].join("\n"),
    },
  ]);
  assert.equal(JSON.stringify(projected).includes("scratch reasoning"), false);
  assert.equal(JSON.stringify(projected).includes("潮湿砖墙"), false);
  assert.equal(JSON.stringify(projected).includes("一次性渲染事实"), false);
  assert.equal(projected.includes(currentUser), true);
});

void test("projectSettlementWorkingSet leaves the active player loop byte-stable", () => {
  const currentUser = user("翻过围墙");
  const currentCall = assistantToolCall("current", "lookup", { query: "巷道" });
  const currentResult = toolResult("current", "lookup result");
  const messages = [user("old"), currentUser, currentCall, currentResult];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.equal(projected[1], currentUser);
  assert.equal(projected[2], currentCall);
  assert.equal(projected[3], currentResult);
  assert.deepEqual(projected.slice(1), messages.slice(1));
});

void test("completed-turn prefix stays byte-stable while the active loop grows", () => {
  const completed = [
    user("先观察"),
    assistantToolCall("packet-1", "submit_direction_packet", {
      needsRender: true,
      playerAction: "观察巷口",
      resolvedChanges: ["发现脚印"],
    }),
    toolResult("packet-1", "accepted", false, "submit_direction_packet"),
  ];
  const currentUser = user("追上去");
  const initial = projectSettlementWorkingSet([...completed, currentUser], RETENTION_FOR);
  const grown = projectSettlementWorkingSet(
    [
      ...completed,
      currentUser,
      assistantToolCall("current", "lookup", { query: "脚印" }),
      toolResult("current", "result"),
    ],
    RETENTION_FOR,
  );
  const initialBoundary = initial.indexOf(currentUser);
  const grownBoundary = grown.indexOf(currentUser);

  assert.equal(
    JSON.stringify(initial.slice(0, initialBoundary)),
    JSON.stringify(grown.slice(0, grownBoundary)),
  );
});

void test("projectSettlementWorkingSet condenses a completed skill expansion", () => {
  const invocation = skillUser("time-sense", "跳过到第二天");
  const messages = [
    invocation,
    assistantToolCall("packet-1", "submit_direction_packet", {
      needsRender: true,
      playerAction: "休息到清晨",
      resolvedChanges: ["时间推进至次日"],
    }),
    toolResult("packet-1", "accepted", false, "submit_direction_packet"),
    user("出门"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.deepEqual(projected[0]?.content, [
    {
      type: "text",
      text: "[已完成技能调用]\n玩家调用 /skill:time-sense\n参数：跳过到第二天",
    },
  ]);
  assert.equal(JSON.stringify(projected).includes("large skill instructions"), false);
});

void test("projectSettlementWorkingSet retains start-game until initialization crosses a player boundary", () => {
  const invocation = skillUser("start-game");
  const collectionPacket = assistantToolCall("packet-1", "submit_direction_packet", {
    needsRender: false,
    directReply: "选择开局",
  });
  const initialization = assistantToolCall("init-1", "initialize_new_game");
  const secondTurn = [
    invocation,
    collectionPacket,
    toolResult("packet-1", "accepted", false, "submit_direction_packet"),
    user("FSF，新手模式"),
    initialization,
    toolResult("init-1", "initialized"),
  ];

  const duringInitialization = projectSettlementWorkingSet(secondTurn, RETENTION_FOR);
  assert.equal(duringInitialization[0], invocation);

  const afterInitialization = projectSettlementWorkingSet(
    [...secondTurn, user("环顾四周")],
    RETENTION_FOR,
  );
  assert.deepEqual(afterInitialization[0]?.content, [
    { type: "text", text: "[已完成技能调用]\n玩家调用 /skill:start-game" },
  ]);
});

void test("an earlier initialization does not terminate a newer start-game invocation", () => {
  const invocation = skillUser("start-game");
  const messages = [
    user("旧开局"),
    assistantToolCall("old-init", "initialize_new_game"),
    toolResult("old-init", "initialized"),
    invocation,
    assistantToolCall("packet-1", "submit_direction_packet", {
      needsRender: false,
      directReply: "选择新开局",
    }),
    toolResult("packet-1", "accepted", false, "submit_direction_packet"),
    user("默认"),
  ];

  const projected = projectSettlementWorkingSet(messages, RETENTION_FOR);

  assert.equal(projected.includes(invocation), true);
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
