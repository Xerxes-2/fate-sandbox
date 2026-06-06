import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

void test("tool registry keeps entry schemas loose", () => {
  const source = readFileSync(join(process.cwd(), "tools", "registry.ts"), "utf-8");
  const forbidden = ["Type", "Union"].join(".");

  assert.equal(
    source.includes(forbidden),
    false,
    "Tool entry schemas must stay loose; domain tools/normalizers should validate unions to avoid anyOf/literal schema errors.",
  );
});
