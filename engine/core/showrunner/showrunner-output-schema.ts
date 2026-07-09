/**
 * TimelineShowrunnerOutput TypeBox 验收（ADR 0007 回程防火墙）。
 *
 * 审计子进程返回裸 JSON 字符串；engine 严格校验结构后 verdict 才能回到 GM。
 * 校验失败抛出的错误只含字段路径与期望形态，不回流子进程裸文本——
 * executable-JSON-only 从 prompt 恳求升级为代码验收。
 */

import type { Static } from "typebox";

import type { TypeBoxValidator } from "../utils/typebox-validation.ts";

import { Type } from "typebox";
import { Compile } from "typebox/compile";

import { stringEnumSchema } from "../state/state-enum-schemas.ts";
import { parseTypeBoxValue, trimStringsDeep } from "../utils/typebox-validation.ts";

const DRIFT_LEVEL_SCHEMA = stringEnumSchema(["none", "watch", "drifting", "severe"]);
const VERDICT_SCHEMA = stringEnumSchema(["pass", "conditional-pass", "fail"]);
const HOOK_STATUS_SCHEMA = stringEnumSchema(["active", "parked", "paid", "escalated", "retired"]);
const MYSTERY_BUDGET_STATUS_SCHEMA = stringEnumSchema([
  "healthy",
  "overused",
  "underused",
  "wrong-genre",
]);
const WORLD_MOTION_STATUS_SCHEMA = stringEnumSchema(["alive", "stale", "railroaded", "noisy"]);

const TIMELINE_SHOWRUNNER_OUTPUT_SCHEMA = Type.Object({
  timelineId: Type.String({ minLength: 1 }),
  genreContract: Type.String({ minLength: 1 }),
  driftLevel: DRIFT_LEVEL_SCHEMA,
  verdict: VERDICT_SCHEMA,
  driftFindings: Type.Array(Type.String()),
  hardBlockers: Type.Array(Type.String()),
  requiredCorrections: Type.Array(Type.String({ minLength: 1 })),
  pressurePalette: Type.Array(Type.String()),
  nextBeatRecommendations: Type.Array(Type.String()),
  npcAutonomyChecks: Type.Array(Type.String()),
  hookLedger: Type.Array(
    Type.Object({
      hook: Type.String({ minLength: 1 }),
      status: HOOK_STATUS_SCHEMA,
      evidence: Type.String(),
      requiredAction: Type.String(),
    }),
  ),
  mysteryBudget: Type.Object({
    status: MYSTERY_BUDGET_STATUS_SCHEMA,
    correction: Type.String(),
  }),
  worldMotion: Type.Object({
    status: WORLD_MOTION_STATUS_SCHEMA,
    evidence: Type.String(),
    requiredAction: Type.String(),
  }),
  forbiddenMoves: Type.Array(Type.String()),
});

export type TimelineShowrunnerOutput = Static<typeof TIMELINE_SHOWRUNNER_OUTPUT_SCHEMA>;

const COMPILED_VALIDATOR = Compile(TIMELINE_SHOWRUNNER_OUTPUT_SCHEMA);

// Static<typeof schema> → TimelineShowrunnerOutput 双向兼容由 TypeBoxValidator 泛型约束保证
const VALIDATOR: TypeBoxValidator<TimelineShowrunnerOutput> = COMPILED_VALIDATOR;

/**
 * 从审计子进程返回的裸 JSON 字符串解析 TimelineShowrunnerOutput。
 * 解析失败抛出 Error；错误信息只含字段路径，不含子进程裸文本。
 */
export function parseShowrunnerOutput(raw: string): TimelineShowrunnerOutput {
  const parsed = parseRawJson(raw);
  return parseTypeBoxValue(trimStringsDeep(parsed), "TimelineShowrunnerOutput", VALIDATOR);
}

function parseRawJson(raw: string): unknown {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("showrunner 审计未返回有效 JSON 对象。输出必须以 { 开头、} 结尾。");
  }
  try {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch (cause) {
    throw new Error("showrunner 审计返回的 JSON 无法解析。", { cause });
  }
}
