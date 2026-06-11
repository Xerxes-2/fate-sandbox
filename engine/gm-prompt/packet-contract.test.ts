import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Direction packet 契约在两处维护：
 * - agents/gm-direction.md（结算器：怎么写 packet）
 * - agents/gm-render-system.md（渲染器：怎么读 packet）
 * 本测试锁住两份文件的共享语义，防止单边修改造成漂移。
 */

const direction = readFileSync("agents/gm-direction.md", "utf-8");
const renderSystem = readFileSync("agents/gm-render-system.md", "utf-8");

const PACKET_FIELDS = [
  "playerAction",
  "resolvedChanges",
  "npcStances",
  "sensoryAnchors",
  "endWindow",
  "eventWeight",
  "canonFacts",
] as const;

void test("packet contract files describe the same field set", () => {
  for (const field of PACKET_FIELDS) {
    assert.match(direction, new RegExp(`\\b${field}\\b`, "u"), `gm-direction.md missing ${field}`);
    assert.match(
      renderSystem,
      new RegExp(`\\b${field}\\b`, "u"),
      `gm-render-system.md missing ${field}`,
    );
  }
});

void test("packet contract files agree on eventWeight length thresholds", () => {
  const thresholds = extractEventWeightThresholds(direction);
  assert.deepEqual(
    extractEventWeightThresholds(renderSystem),
    thresholds,
    "eventWeight thresholds drifted between gm-direction.md and gm-render-system.md",
  );
  assert.deepEqual(Object.keys(thresholds).toSorted(), ["heavy", "light", "normal"]);
});

void test("packet contract files agree on binding fields", () => {
  for (const field of ["playerAction", "resolvedChanges", "endWindow"]) {
    const bindingPattern = new RegExp(`\`${field}\`[^\\n]*binding`, "u");
    assert.match(direction, bindingPattern, `gm-direction.md: ${field} must be marked binding`);
    assert.match(
      renderSystem,
      bindingPattern,
      `gm-render-system.md: ${field} must be marked binding`,
    );
  }
});

function extractEventWeightThresholds(text: string): Record<string, string> {
  const thresholds: Record<string, string> = {};
  for (const weight of ["light", "normal", "heavy"]) {
    const match = new RegExp(`${weight}[^\\d]{0,12}(\\d+(?:[–-]\\d+)?)`, "u").exec(text);
    assert.ok(match?.[1], `missing ${weight} threshold`);
    thresholds[weight] = match[1].replace("-", "–");
  }
  return thresholds;
}
