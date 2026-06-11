import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFateRank,
  compareFateRanks,
  fateRankOrderValue,
  fateRankSide,
  fateRankWithinRange,
  isFateRankRange,
  parseFateRankRange,
} from "./fate-rank.ts";

void test("Fate rank comparison treats two main ranks as overwhelming", () => {
  const result = compareFateRanks("A", "C");

  assert.equal(result.baselineTierDelta, 2);
  assert.equal(result.band, "overwhelming");
});

void test("plus does not raise the baseline: B+ vs A stays a disadvantage", () => {
  const result = compareFateRanks("B+", "A");

  assert.equal(result.baselineTierDelta, -1);
  assert.equal(result.band, "advantage");
  assert.match(result.narrative, /倍化窗口/u);
});

void test("plus carries a burst value of baseline times (1 + plus count)", () => {
  assert.equal(fateRankSide("B+").burstValue, 80);
  assert.equal(fateRankSide("B++").burstValue, 120);
  assert.equal(fateRankSide("C+++").burstValue, 120);
  assert.equal(fateRankSide("B").burstValue, null);
});

void test("minus counts one tier lower at baseline per canon instability", () => {
  const side = fateRankSide("B-");
  assert.equal(side.baselineValue, 30);
  assert.equal(side.unstable, true);

  const result = compareFateRanks("B+", "B-");
  assert.equal(result.baselineTierDelta, 1);
  assert.equal(result.band, "advantage");
  assert.match(result.narrative, /不安定/u);
});

void test("same-tier with asymmetric burst potential is an edge", () => {
  const result = compareFateRanks("B+", "B");

  assert.equal(result.baselineTierDelta, 0);
  assert.equal(result.band, "edge");
});

void test("EX is off-scale and never linearly compared", () => {
  const result = compareFateRanks("EX", "B");

  assert.equal(result.band, "off-scale");
  assert.equal(result.baselineTierDelta, 0);
  assert.equal(result.left.offScale, true);
  assert.equal(result.left.baselineValue, null);
  assert.match(result.narrative, /规格外/u);
  assert.match(result.narrative, /不默认强于 A/u);

  assert.equal(compareFateRanks("EX", "EX").band, "off-scale");
});

void test("Fate rank validation accepts multi-plus ranks", () => {
  assert.equal(assertFateRank("A++", "rank"), "A++");
  assert.equal(assertFateRank("B+++", "rank"), "B+++");
});

void test("Fate rank validation rejects invalid rank grammar", () => {
  assert.throws(() => assertFateRank("S", "rank"), /非法 Fate rank/);
  assert.throws(() => assertFateRank("unknown", "rank"), /非法 Fate rank/);
  assert.throws(() => assertFateRank("E~A++", "rank"), /非法 Fate rank/);
});

void test("Fate rank ranges parse and bound release picks", () => {
  assert.equal(isFateRankRange("E~A++"), true);
  assert.equal(isFateRankRange("B"), false);

  const range = parseFateRankRange("E~A++");
  assert.equal(range.low, "E");
  assert.equal(range.high, "A++");

  assert.equal(fateRankWithinRange("C", "E~A++"), true);
  assert.equal(fateRankWithinRange("A++", "E~A++"), true);
  assert.equal(fateRankWithinRange("EX", "E~A++"), false);
  assert.throws(() => parseFateRankRange("A~E"), /下界不得高于上界/u);
});

void test("order value ranks modifiers for sorting without inflating tiers", () => {
  assert.ok(fateRankOrderValue("B+") > fateRankOrderValue("B"));
  assert.ok(fateRankOrderValue("B-") < fateRankOrderValue("B"));
  assert.ok(fateRankOrderValue("A") > fateRankOrderValue("B+++"));
});
