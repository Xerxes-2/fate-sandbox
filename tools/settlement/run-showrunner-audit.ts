/**
 * run_showrunner_audit 领域工具（ADR 0007；engine 直起同步 hermetic 审计员）。
 *
 * GM 给 typed TimelineShowrunnerInput；engine 拼 persona + input + Showrunner
 * Projection，【阻塞 fork 一个 `pi -p` 审计子进程】等它跑完，读回 session 里的
 * 裸 verdict，过 TimelineShowrunnerOutput schema gate 后才返回。失败（启动/超时/
 * 无输出/结构非法）返回结构化失败分支，零引擎重试——由 GM 决定重调或跳过。
 */

import type { Static } from "typebox";

import type { ShowrunnerAuditResult } from "../../engine/core/showrunner/showrunner-audit.ts";
import type { TimelineShowrunnerOutput } from "../../engine/core/showrunner/showrunner-output-schema.ts";
import type { TimelineShowrunnerInput } from "../../engine/core/showrunner/showrunner-prompt.ts";
import type { TypeBoxValidator } from "../../engine/core/utils/typebox-validation.ts";
import type { FateToolDefinition } from "../runtime/tool-definition.ts";
import type { ToolResult } from "../runtime/tool-result.ts";

import { Type } from "typebox";
import { Compile } from "typebox/compile";

import { runShowrunnerAudit } from "../../engine/core/showrunner/showrunner-audit.ts";
import { hydrateStateFromSessionManager } from "../../engine/core/state/session-hydration.ts";
import {
  OPENING_MODE_SCHEMA,
  TIMELINE_ID_SCHEMA,
} from "../../engine/core/state/state-enum-schemas.ts";
import { getState } from "../../engine/core/state/state-store.ts";
import { parseTypeBoxValue } from "../../engine/core/utils/typebox-validation.ts";
import { textResult } from "../runtime/tool-result.ts";

const STORY_WINDOW_SCHEMA = Type.Object({
  title: Type.String({ minLength: 1 }),
  completionCriteria: Type.Array(Type.String()),
  forbiddenEscalations: Type.Array(Type.String()),
  nextBeatHints: Type.Array(Type.String()),
});

/** typed 输入契约：同一份 schema 既是 pi parameters 又是工具边界窄化验收。 */
const RUN_SHOWRUNNER_AUDIT_PARAMETERS = Type.Object({
  timelineId: TIMELINE_ID_SCHEMA,
  openingMode: OPENING_MODE_SCHEMA,
  premise: Type.String({ minLength: 1, description: "当前 campaign premise 摘要" }),
  activeRuleSetIds: Type.Array(Type.String(), { description: "启用的规则集 id" }),
  currentArc: Type.String({ minLength: 1 }),
  currentBeat: Type.String({ minLength: 1 }),
  storyWindow: Type.Optional(STORY_WINDOW_SCHEMA),
  playerVisibleFacts: Type.Array(Type.String(), { description: "玩家当前可依赖的事实" }),
  recentBeats: Type.Array(Type.String(), { description: "最近数个 beat 的一句话摘要" }),
  suspectedDrift: Type.Array(Type.String(), { description: "GM 怀疑的漂移点；可为空数组" }),
});

type RunShowrunnerAuditParams = Static<typeof RUN_SHOWRUNNER_AUDIT_PARAMETERS>;

// Compile 必须在独立常量上调用（类型注解上下文会干扰泛型推导，见 servant-schema.ts）
const COMPILED_PARAMETERS_VALIDATOR = Compile(RUN_SHOWRUNNER_AUDIT_PARAMETERS);
const PARAMETERS_VALIDATOR: TypeBoxValidator<RunShowrunnerAuditParams> =
  COMPILED_PARAMETERS_VALIDATOR;

/** sessionDir 仅供测试注入临时夹具目录；生产走默认 SHOWRUNNER_SESSION_DIR。 */
export async function runShowrunnerAuditTool(
  params: unknown,
  sessionManager: unknown,
  sessionDir?: string,
): Promise<ToolResult> {
  if (sessionManager !== undefined) {
    hydrateStateFromSessionManager(sessionManager);
  }
  const parsed = parseTypeBoxValue(params, "run_showrunner_audit 参数", PARAMETERS_VALIDATOR);
  const input: TimelineShowrunnerInput = { ...parsed, storyWindow: parsed.storyWindow ?? null };
  const result = await runShowrunnerAudit(getState(), input, sessionDir);
  return result.kind === "verdict" ? verdictResult(result) : failureResult(result);
}

function verdictResult(result: ShowrunnerAuditResult & { kind: "verdict" }): ToolResult {
  const output = result.output;
  return textResult(buildVerdictGuidance(output), {
    runId: result.runId,
    verdict: output,
  });
}

function buildVerdictGuidance(output: TimelineShowrunnerOutput): string {
  const lines = [
    "showrunner 审计完成（engine schema 验收通过）。",
    `- verdict: ${output.verdict}  driftLevel: ${output.driftLevel}`,
    `- worldMotion: ${output.worldMotion.status}  mysteryBudget: ${output.mysteryBudget.status}`,
  ];
  if (output.hardBlockers.length > 0) {
    lines.push(`- hardBlockers: ${output.hardBlockers.join("; ")}`);
  }
  if (output.requiredCorrections.length > 0) {
    lines.push("- requiredCorrections（下一回合必须执行）:");
    for (const correction of output.requiredCorrections) {
      lines.push(`  - ${correction}`);
    }
  }
  lines.push(
    "完整 verdict 见 details.verdict；按 requiredCorrections 调整下一回合，不要复述给玩家。",
  );
  return lines.join("\n");
}

function failureResult(result: ShowrunnerAuditResult & { kind: "failure" }): ToolResult {
  return textResult(
    [
      `showrunner 审计失败（${result.reason}）：${result.detail}`,
      "失败不算审计通过。由你决定：修正后重调 run_showrunner_audit，或本轮跳过审计继续推进。",
    ].join("\n"),
    { runId: result.runId, reason: result.reason, detail: result.detail },
  );
}

export const runShowrunnerAuditToolDefinition: FateToolDefinition = {
  name: "run_showrunner_audit",
  resultRetention: { kind: "latest-cross-player-turn" },
  description:
    "同步运行 showrunner 审计，判断故事是否偏离当前 timeline 题材契约。引擎通过仅提供 lookup、没有写工具的 pi -p 子进程执行审计；verdict 通过 schema 验收后才会返回。\n\n" +
    "使用边界：\n" +
    "- settlement/tool-policy.md 触发 showrunner 审计（题材漂移、beat 原地打转、mystery hook 无新意复推、下一步 offscreen 生态不明）\n" +
    "- 调用会阻塞至审计完成（约 1-5 分钟）；verdict 的 requiredCorrections 面向下一回合执行\n" +
    "- 返回「审计失败」时由你决定重调或跳过；失败不算通过\n\n" +
    "禁区：\n" +
    "- 把 verdict JSON 或 requiredCorrections 原样写进玩家可见正文\n" +
    "- 用审计结果替代领域工具落地（矫正动作仍走 commit_turn / update_hook 等）\n" +
    "- 伪造或复述审计结论当作已执行",
  parameters: RUN_SHOWRUNNER_AUDIT_PARAMETERS,
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    runShowrunnerAuditTool(params, ctx.sessionManager),
};
