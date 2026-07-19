import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("render prompt avoids priming the denied negation pattern", () => {
  const prompts = [
    readFileSync("prompts/render/protocol.md", "utf-8"),
    readFileSync("prompts/render/style-rules.md", "utf-8"),
    readFileSync("prompts/render/style-blacklist.md", "utf-8"),
    readFileSync("prompts/render/output-contract.md", "utf-8"),
  ];

  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /(?<!可)不是/u);
  }
});

void test("renderer prompt keeps current player input as the first prose seed", () => {
  const systemRender = readFileSync("prompts/render/system.md", "utf-8");
  const renderPrompt = readFileSync("prompts/render/protocol.md", "utf-8");

  assert.match(systemRender, /Player Input Render Contract/u);
  assert.match(systemRender, /# Current Player Input` is the prose seed/u);
  assert.match(systemRender, /does not replace the raw expression/u);
  assert.match(renderPrompt, /first visible beat belongs to the player's intent/u);
  assert.match(renderPrompt, /Do not reopen with a scenery lap/u);
});

void test("renderer prompt derives narrative person instead of locking second person", () => {
  const systemRender = readFileSync("prompts/render/system.md", "utf-8");
  const renderPrompt = readFileSync("prompts/render/protocol.md", "utf-8");

  assert.match(systemRender, /No narrative person is globally fixed/u);
  assert.match(systemRender, /explicit player instruction/u);
  assert.match(
    systemRender,
    /preserve the narrative person and focalization of recent body prose/u,
  );
  assert.match(systemRender, /choose the person that fits the current input and packet/u);
  assert.doesNotMatch(systemRender, /second-person Chinese/u);
  assert.doesNotMatch(renderPrompt, /second-person Chinese/u);
});

void test("output contract blocks assistant delivery wrappers", () => {
  const outputContract = readFileSync("prompts/render/output-contract.md", "utf-8");

  assert.match(outputContract, /状态已经/u);
  assert.match(outputContract, /现在为你写/u);
  assert.match(outputContract, /Markdown dividers/u);
  assert.match(outputContract, /first line must be in-scene/u);
});

void test("render prompt emphasizes relationship and body rendering", () => {
  const renderPrompt = readFileSync("prompts/render/protocol.md", "utf-8");

  assert.match(renderPrompt, /Formation \/ distance/u);
  assert.match(renderPrompt, /Body cost/u);
  assert.match(renderPrompt, /Relationship burden/u);
  assert.match(renderPrompt, /NPC scene participation/u);
});
