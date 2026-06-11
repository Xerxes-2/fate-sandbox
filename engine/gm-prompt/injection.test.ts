import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";

import { resetState } from "../core/state-store.ts";
import {
  buildRendererSystemPrompt,
  buildSystemPrompt,
  injectGmPromptMessages,
} from "./injection.ts";

interface UserMessage {
  role: "user";
  content: Array<{ type: "text"; text: string }>;
  timestamp: number;
}

void test("buildSystemPrompt appends only the settlement director identity", () => {
  const systemPrompt = buildSystemPrompt("base");

  assert.match(systemPrompt, /base/);
  assert.match(systemPrompt, /Fate\/Stay Night Sandbox/);
  assert.match(systemPrompt, /settlement director/);
  assert.match(systemPrompt, /submit_direction_packet/);
  assert.doesNotMatch(systemPrompt, /narrator \(GM\)/u);
  assert.doesNotMatch(systemPrompt, /Internal Check Module/);
  assert.doesNotMatch(systemPrompt, /Final Output Contract/);
});

void test("injectGmPromptMessages inserts slot-based prompt stack", () => {
  resetState();
  const messages: UserMessage[] = [createUserMessage("继续。")];

  const injected = injectGmPromptMessages<UserMessage>(messages);
  const texts = injected.map((message) => textOf(message));

  assert.equal(injected.length, 11);
  assert.match(texts[0] ?? "", /<settlement_principles>/);
  assert.match(texts[1] ?? "", /<world_context>/);
  assert.match(texts[2] ?? "", /<input_guide>/);
  assert.match(texts[3] ?? "", /<social_guide>/);
  assert.match(texts[4] ?? "", /<tool_policy>/);
  assert.match(texts[5] ?? "", /<hard_rules>/);
  assert.match(texts[6] ?? "", /<story_driver>/);
  assert.equal(texts[7], "继续。");
  assert.match(texts[8] ?? "", /<mechanical_state>/);
  assert.match(texts[8] ?? "", /目标推进规则/);
  assert.match(texts[8] ?? "", /当前没有可 resolve 的目标/);
  assert.doesNotMatch(texts[8] ?? "", /active beat 收口/);
  assert.match(texts[9] ?? "", /<turn_reminder>/);
  assert.match(texts[10] ?? "", /<direction_contract>/);
  // 结算投影零 style/render 模块
  for (const text of texts) {
    assert.doesNotMatch(
      text,
      /<style_blacklist>|<writing_guide>|<render_protocol>|<output_contract>/,
    );
  }
});

void test("buildRendererSystemPrompt assembles clean-room render stack", () => {
  const prompt = buildRendererSystemPrompt();

  assert.match(prompt, /prose renderer \(Pass B\)/);
  assert.match(prompt, /Direction Packet Contract/);
  assert.match(prompt, /<creative_constitution>/);
  assert.match(prompt, /<style_blacklist>/);
  assert.match(prompt, /<writing_guide>/);
  assert.match(prompt, /<render_protocol>/);
  assert.match(prompt, /<protagonist_impression>/);
  assert.match(prompt, /<output_contract>/);
  // 渲染器看不到工具/机械模块
  assert.doesNotMatch(
    prompt,
    /<tool_policy>|<hard_rules>|<story_driver>|<mechanical_state>|<direction_contract>/,
  );
});

void test("prompt assembly prefers local user prompt overrides", () => {
  resetState();
  const overridePath = "agents/user/protagonist-impression.md";
  const original = existsSync(overridePath) ? readFileSync(overridePath, "utf-8") : null;
  mkdirSync("agents/user", { recursive: true });
  writeFileSync(overridePath, "# 本地主角印象\n\n本地覆盖测试。\n");
  try {
    const prompt = buildRendererSystemPrompt();

    assert.match(prompt, /本地覆盖测试/);
    assert.doesNotMatch(prompt, /待填写/);
  } finally {
    if (original === null) {
      rmSync(overridePath, { force: true });
    } else {
      writeFileSync(overridePath, original);
    }
  }
});

void test("injectGmPromptMessages keeps conversation history contiguous before runtime slots", () => {
  resetState();
  const messages: UserMessage[] = [createUserMessage("第一句。"), createUserMessage("第二句。")];

  const injected = injectGmPromptMessages<UserMessage>(messages);
  const texts = injected.map((message) => textOf(message));

  assert.equal(texts[7], "第一句。");
  assert.equal(texts[8], "第二句。");
  assert.match(texts[9] ?? "", /<mechanical_state>/);
});

function createUserMessage(text: string): UserMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: 0,
  };
}

function textOf(message: UserMessage): string {
  return message.content.map((part) => part.text).join("\n");
}
