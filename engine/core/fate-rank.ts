import type { FateRank } from "./state.ts";

/**
 * Canon 参数规则（Fate side material「パラメータールール」）：
 * - 数值基准：E=10，每主级 +10，A=50。
 * - 「+」= 瞬间倍化：基线不变，条件触发的一瞬数值 ×(1+加号数)。+ 为 2 倍、++ 为 3 倍、+++ 为 4 倍。
 * - 「-」= 不安定：判定（资格）按原级，实际输出未满原级（实质低一级）。
 * - 「EX」= 规格外：不在 E~A 标尺上，无法数值化，也不默认强于 A。
 */
export type FateRankComparisonBand =
  | "same-tier"
  | "edge"
  | "advantage"
  | "overwhelming"
  | "off-scale";

export interface FateRankSide {
  rank: FateRank;
  /** EX：规格外，不可数值比较。 */
  offScale: boolean;
  /** 基线数值（E=10..A=50，「-」再降 10）；EX 为 null。 */
  baselineValue: number | null;
  /** 「+」的瞬间倍化峰值（基线 ×(1+加号数)）；无 + 或 EX 为 null。 */
  burstValue: number | null;
  /** 「-」：判定按原级、实际输出未满。 */
  unstable: boolean;
}

export interface FateRankComparison {
  left: FateRankSide;
  right: FateRankSide;
  /** 基线主级差（左-右，单位＝主级）；任一侧 off-scale 时为 0。 */
  baselineTierDelta: number;
  band: FateRankComparisonBand;
  narrative: string;
}

export type FateRankRange = `${FateRank}~${FateRank}`;

type FateRankMain = "E" | "D" | "C" | "B" | "A" | "EX";

const MAIN_RANK_ORDER: readonly FateRankMain[] = ["E", "D", "C", "B", "A", "EX"];
const RANK_PATTERN = /^(E|D|C|B|A|EX)(\+{1,3}|-)?$/;
const RANGE_PATTERN = /^(?:E|D|C|B|A|EX)(?:\+{1,3}|-)?~(?:E|D|C|B|A|EX)(?:\+{1,3}|-)?$/;

export function compareFateRanks(left: FateRank, right: FateRank): FateRankComparison {
  const leftSide = fateRankSide(left);
  const rightSide = fateRankSide(right);

  if (leftSide.offScale || rightSide.offScale) {
    return {
      left: leftSide,
      right: rightSide,
      baselineTierDelta: 0,
      band: "off-scale",
      narrative: offScaleNarrative(leftSide, rightSide),
    };
  }

  const leftValue = requireBaseline(leftSide);
  const rightValue = requireBaseline(rightSide);
  const baselineTierDelta = (leftValue - rightValue) / 10;
  const band = comparisonBand(baselineTierDelta, leftSide, rightSide);
  return {
    left: leftSide,
    right: rightSide,
    baselineTierDelta,
    band,
    narrative: comparisonNarrative(band, baselineTierDelta, leftSide, rightSide),
  };
}

export function fateRankSide(rank: FateRank): FateRankSide {
  const parsed = parseFateRank(rank);
  if (parsed.main === "EX") {
    return {
      rank: parsed.rank,
      offScale: true,
      baselineValue: null,
      burstValue: null,
      unstable: false,
    };
  }
  const tierValue = (MAIN_RANK_ORDER.indexOf(parsed.main) + 1) * 10;
  const unstable = parsed.modifier === "-";
  const baselineValue = unstable ? Math.max(tierValue - 10, 0) : tierValue;
  const plusCount =
    parsed.modifier !== undefined && parsed.modifier !== "-" ? parsed.modifier.length : 0;
  return {
    rank: parsed.rank,
    offScale: false,
    baselineValue,
    burstValue: plusCount > 0 ? baselineValue * (1 + plusCount) : null,
    unstable,
  };
}

/** 用于范围上下界与最优系强排序的序值；EX 排在所有常规值之上仅作排序用途，不代表强度。 */
export function fateRankOrderValue(rank: FateRank): number {
  const parsed = parseFateRank(rank);
  const tier = (MAIN_RANK_ORDER.indexOf(parsed.main) + 1) * 10;
  if (parsed.modifier === undefined) return tier;
  if (parsed.modifier === "-") return tier - 5;
  return tier + parsed.modifier.length;
}

export function assertFateRank(value: unknown, fieldName: string): FateRank {
  if (typeof value !== "string") {
    throw new Error(`非法${fieldName}: 必须是 Fate rank 字符串。`);
  }
  return parseFateRank(value).rank;
}

export function isFateRankRange(value: string): value is FateRankRange {
  return RANGE_PATTERN.test(value);
}

export function parseFateRankRange(range: FateRankRange): { low: FateRank; high: FateRank } {
  const [lowText, highText] = range.split("~");
  const low = assertFateRank(lowText, "范围下界");
  const high = assertFateRank(highText, "范围上界");
  if (fateRankOrderValue(low) > fateRankOrderValue(high)) {
    throw new Error(`非法 Fate rank 范围: ${range}。下界不得高于上界。`);
  }
  return { low, high };
}

export function fateRankWithinRange(rank: FateRank, range: FateRankRange): boolean {
  const { low, high } = parseFateRankRange(range);
  const value = fateRankOrderValue(rank);
  return value >= fateRankOrderValue(low) && value <= fateRankOrderValue(high);
}

function parseFateRank(rank: string): {
  rank: FateRank;
  main: FateRankMain;
  modifier: string | undefined;
} {
  const match = RANK_PATTERN.exec(rank);
  if (match === null) {
    throw new Error(`非法 Fate rank: ${rank}。允许 E/D/C/B/A/EX 与可选 -、+、++、+++。`);
  }
  const base = match[1];
  if (!isFateRankMain(base)) {
    throw new Error(`非法 Fate rank: ${rank}。`);
  }
  return { rank: buildFateRank(base, match[2]), main: base, modifier: match[2] };
}

function isFateRankMain(value: unknown): value is FateRankMain {
  return (
    value === "E" ||
    value === "D" ||
    value === "C" ||
    value === "B" ||
    value === "A" ||
    value === "EX"
  );
}

function buildFateRank(base: FateRankMain, modifier: string | undefined): FateRank {
  if (modifier === "+" || modifier === "++" || modifier === "+++") {
    return `${base}${modifier}`;
  }
  if (modifier === "-") {
    return `${base}-`;
  }
  return base;
}

function requireBaseline(side: FateRankSide): number {
  if (side.baselineValue === null) {
    throw new Error("unreachable: off-scale side has no baseline value");
  }
  return side.baselineValue;
}

function comparisonBand(
  baselineTierDelta: number,
  left: FateRankSide,
  right: FateRankSide,
): FateRankComparisonBand {
  const absoluteDelta = Math.abs(baselineTierDelta);
  if (absoluteDelta >= 2) return "overwhelming";
  if (absoluteDelta >= 1) return "advantage";
  if ((left.burstValue !== null) !== (right.burstValue !== null)) return "edge";
  return "same-tier";
}

function comparisonNarrative(
  band: FateRankComparisonBand,
  baselineTierDelta: number,
  left: FateRankSide,
  right: FateRankSide,
): string {
  const direction = baselineTierDelta >= 0 ? "左侧" : "右侧";
  const annotations = sideAnnotations(left, right);
  switch (band) {
    case "overwhelming":
      return `${direction}形成两级以上参数压制；技能、宝具、地形或相性才可能逆转。${annotations}`;
    case "advantage":
      return `${direction}有一个主等级优势；进入优势交锋或消耗区间。${annotations}`;
    case "edge":
      return `双方基线同级；「+」是条件触发的瞬间倍化窗口，未开时不构成等级差。${annotations}`;
    case "same-tier":
      return `双方参数同级；结果应由技能、位置、准备与代价决定。${annotations}`;
    case "off-scale":
      throw new Error("unreachable: off-scale handled separately");
    default:
      throw new Error("unreachable Fate rank comparison band");
  }
}

function offScaleNarrative(left: FateRankSide, right: FateRankSide): string {
  const offScaleLabel =
    left.offScale && right.offScale
      ? "双方均为规格外（EX）"
      : left.offScale
        ? "左侧为规格外（EX）"
        : "右侧为规格外（EX）";
  return `${offScaleLabel}：EX 不在 E~A 标尺上，不默认强于 A；按能力的质与适用条件裁决，而非数值压制。${sideAnnotations(left, right)}`;
}

function sideAnnotations(left: FateRankSide, right: FateRankSide): string {
  const notes: string[] = [];
  for (const [label, side] of [
    ["左侧", left],
    ["右侧", right],
  ] as const) {
    if (side.unstable) {
      notes.push(`${label} ${side.rank} 不安定：判定按原级、实际输出未满（基线已按低一级计）。`);
    }
    if (side.burstValue !== null && side.baselineValue !== null) {
      notes.push(
        `${label} ${side.rank} 持有倍化窗口：条件触发的一瞬可达 ${side.burstValue}（基线 ${side.baselineValue}）。`,
      );
    }
  }
  return notes.length > 0 ? ` ${notes.join("")}` : "";
}
