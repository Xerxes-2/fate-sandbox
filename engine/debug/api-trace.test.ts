import assert from "node:assert/strict";
import test from "node:test";

import { isApiTraceEnabled, renderTranscript } from "./api-trace.ts";

void test("api trace is disabled under node:test even if the env flag is set", () => {
  process.env["FATE_DEBUG_API"] = "1";
  assert.equal(isApiTraceEnabled(), false);
  delete process.env["FATE_DEBUG_API"];
});

void test("renderTranscript renders system prompt, text, toolCall and thinking parts", () => {
  const transcript = renderTranscript("结算 LLM 调用 #1", "你是 GM。", [
    { role: "user", content: "玩家输入" },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "内心推理" },
        { type: "text", text: "旁白草稿" },
        { type: "toolCall", name: "commit_turn", arguments: { events: [] } },
      ],
    },
    { role: "user", customType: "fate-prose", content: [{ type: "text", text: "正文" }] },
    "not-a-record",
  ]);

  assert.match(transcript, /# 结算 LLM 调用 #1/);
  assert.match(transcript, /消息数：4 · system 字符：6/);
  assert.match(transcript, /## SYSTEM\n```\n你是 GM。\n```/);
  assert.match(transcript, /## \[1\] user\n玩家输入/);
  assert.match(transcript, /_\[thinking\]_/);
  assert.match(transcript, /旁白草稿/);
  assert.match(transcript, /→ tool: commit_turn/);
  assert.match(transcript, /"events": \[\]/);
  assert.match(transcript, /_customType: fate-prose_/);
  // 非 record 消息被跳过，不产生第 4 节。
  assert.doesNotMatch(transcript, /## \[4\]/);
});
