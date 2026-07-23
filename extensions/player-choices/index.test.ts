import type { CustomMessageEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import { SUBMIT_DIRECTION_PACKET_TOOL } from "../../engine/session-chronology/session-chronology.ts";
import { buildChoiceWidgetLines, findLatestChoiceSet, parseChoiceCommand } from "./index.ts";

function userEntry(id: string, parentId: string | null): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message: { role: "user", content: "下一步", timestamp: Date.now() },
  };
}

function packetEntry(
  id: string,
  parentId: string,
  suggestedActions: readonly { submitText: string }[] = [],
): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "t1",
          name: SUBMIT_DIRECTION_PACKET_TOOL,
          arguments: {
            needsRender: true,
            playerAction: "继续行动",
            resolvedChanges: ["行动已结算"],
            npcStances: [],
            sensoryAnchors: ["脚步声"],
            endWindow: "前路仍有压力",
            eventWeight: "normal",
            canonFacts: [],
            suggestedActions,
          },
        },
      ],
      api: "test",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "toolUse",
      timestamp: Date.now(),
    },
  };
}

function acceptedResultEntry(id: string, parentId: string): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message: {
      role: "toolResult",
      toolCallId: "t1",
      toolName: SUBMIT_DIRECTION_PACKET_TOOL,
      content: [{ type: "text", text: "accepted" }],
      isError: false,
      timestamp: Date.now(),
    },
  };
}

function proseEntry(
  id: string,
  parentId: string,
  details: Record<string, unknown>,
): CustomMessageEntry {
  return {
    type: "custom_message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    customType: "fsn-prose",
    content: "正文",
    display: true,
    details: { toolCallId: "t1", ...details },
  };
}

function deliveredBranch(
  details: Record<string, unknown>,
  suggestedActions: readonly { submitText: string }[] = [],
): Array<SessionMessageEntry | CustomMessageEntry> {
  return [
    userEntry("u1", null),
    packetEntry("a1", "u1", suggestedActions),
    acceptedResultEntry("r1", "a1"),
    proseEntry("p1", "r1", details),
  ];
}

void test("parseChoiceCommand parses submit and show commands", () => {
  assert.deepEqual(parseChoiceCommand(""), { kind: "show" });
  assert.deepEqual(parseChoiceCommand("2"), { kind: "submit", index: 1 });
  assert.equal(parseChoiceCommand("abc"), undefined);
});

void test("buildChoiceWidgetLines renders numbered full command text", () => {
  assert.deepEqual(
    buildChoiceWidgetLines([{ submitText: "追上去。" }, { submitText: "检查现场。" }]),
    ["── 可选行动（可忽略，直接手打也可以）──", "/choice 1  追上去。", "/choice 2  检查现场。"],
  );
});

void test("findLatestChoiceSet reads actions from the leaf prose", () => {
  const set = findLatestChoiceSet(
    deliveredBranch({ kind: "rendered", suggestedActions: [{ submitText: "伪造行动。" }] }, [
      { submitText: "追上去。" },
    ]),
  );
  assert.deepEqual(set?.actions, [{ submitText: "追上去。" }]);
});

void test("findLatestChoiceSet reads actions from a rerolled prose entry", () => {
  const set = findLatestChoiceSet(
    deliveredBranch(
      {
        kind: "rerolled",
        replacedEntryId: "old",
        lintRuleIds: [],
        suggestedActions: [{ submitText: "伪造行动。" }],
      },
      [{ submitText: "检查祭坛。" }, { submitText: "先撤。" }],
    ),
  );
  assert.deepEqual(set?.actions, [{ submitText: "检查祭坛。" }, { submitText: "先撤。" }]);
});

void test("findLatestChoiceSet returns undefined when a newer message follows the prose", () => {
  const branch = [
    ...deliveredBranch({ kind: "rendered" }, [{ submitText: "追上去。" }]),
    userEntry("u2", "p1"),
  ];
  assert.equal(findLatestChoiceSet(branch), undefined);
});

void test("findLatestChoiceSet returns undefined when the leaf prose has no actions", () => {
  assert.equal(findLatestChoiceSet(deliveredBranch({ kind: "rendered" })), undefined);
});

void test("findLatestChoiceSet rejects an orphan prose delivery", () => {
  const branch = [
    proseEntry("p1", "root", {
      kind: "rendered",
      suggestedActions: [{ submitText: "不应出现。" }],
    }),
  ];
  assert.equal(findLatestChoiceSet(branch), undefined);
});
