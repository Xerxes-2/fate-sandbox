import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { toolResultRetention } from "./registry.ts";

/**
 * 工具文件只组装参数契约，不重复声明领域 union；模型接口与执行校验需要的
 * discriminated union 必须由 engine 的权威 schema 导出，避免两套字段漂移。
 */
void test("tool files do not redeclare domain unions", () => {
  const forbidden = ["Type", "Union"].join(".");
  for (const file of listToolSourceFiles()) {
    const source = readFileSync(file, "utf-8");
    assert.equal(
      source.includes(forbidden),
      false,
      `${file}: import authoritative domain unions from engine instead of redeclaring them.`,
    );
  }
});

void test("tool descriptions avoid checklist headings that bait reasoning", () => {
  const forbiddenHeadings = [
    "【必须调用的场景】",
    "【必须调用场景】",
    "【必须】",
    "【严禁的行为】",
    "【严禁行为】",
    "【严禁】",
  ];
  for (const file of listToolSourceFiles()) {
    const source = readFileSync(file, "utf-8");
    for (const heading of forbiddenHeadings) {
      assert.equal(
        source.includes(heading),
        false,
        `${file}: tool descriptions should use compact boundary bullets, not ${heading}.`,
      );
    }
  }
});

void test("registry exposes explicit cross-turn tool-result handoffs", () => {
  assert.deepEqual(toolResultRetention("commit_turn"), { kind: "current-player-turn" });
  assert.deepEqual(toolResultRetention("harvest_backstage_candidate"), {
    kind: "until-tool-call",
    terminalTools: ["record_offscreen_event", "resolve_backstage_line"],
  });
  assert.deepEqual(toolResultRetention("run_showrunner_audit"), {
    kind: "latest-cross-player-turn",
  });
  assert.deepEqual(toolResultRetention("unknown_tool"), { kind: "current-player-turn" });
});

void test("registry stays a thin list without inline contracts", () => {
  const source = readFileSync(join(process.cwd(), "tools", "registry.ts"), "utf-8");
  assert.equal(
    source.includes("description:"),
    false,
    "tool descriptions live with their implementations, not in the registry",
  );
  assert.equal(
    source.includes("parameters:"),
    false,
    "tool parameter schemas live with their implementations, not in the registry",
  );
});

function listToolSourceFiles(): string[] {
  const root = join(process.cwd(), "tools");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files;
}
