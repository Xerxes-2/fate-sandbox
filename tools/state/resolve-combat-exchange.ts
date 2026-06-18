import type { FateToolDefinition } from "../runtime/tool-definition.ts";
import { Type } from "typebox";

import {
  formatCombatSwing,
  resolveCombatExchange,
  type CombatExchangeResult,
  type CombatStateLanding,
  type CombatSwing,
} from "../../engine/core/combat-exchange.ts";
import { parseCombatExchangeInput } from "../../engine/core/combat-exchange-schema.ts";
import { recordObligation } from "../../engine/core/obligations.ts";
import { seededRandomInt } from "../../engine/core/seeded-rng.ts";
import type { State } from "../../engine/core/state.ts";
import { noNumberNarrativeHint } from "../runtime/narrative-hints.ts";
import type { ToolResult } from "../runtime/tool-result.ts";
import { runDomainEventTool } from "./domain-tool-runner.ts";

export function resolveCombatExchangeTool(params: unknown, sessionManager: unknown): ToolResult {
  const input = parseCombatExchangeInput(params, "resolve_combat_exchange 参数");
  return runDomainEventTool({
    sessionManager,
    // 裁决本身不改战斗状态，但必须落地的 landing 记入义务账本（backlog #4）：
    // canonical commit 对账时账未清则拒绝提交。
    execute: (draft: State) => {
      const result = resolveCombatExchange(draft, {
        ...input,
        swing: input.swing ?? rollCombatSwing(draft),
      });
      const recorded = result.stateLandings
        .filter((landing) => landing.required)
        .map((landing) =>
          recordObligation(draft, {
            source: "combat-exchange",
            kind: landing.kind,
            summary: landing.reason,
          }),
        );
      return { result, recordedObligations: recorded.length };
    },
    details: ({ result }) => ({ result }),
    message: ({ result, recordedObligations }) =>
      formatCombatExchangeResult(result, recordedObligations),
  });
}

function formatCombatExchangeResult(
  result: CombatExchangeResult,
  recordedObligations: number,
): string {
  return [
    `交锋裁决：${result.outcome}`,
    `意图：${result.intent}`,
    `参数/尺度：${result.rankCheck}`,
    `战场变数：${formatCombatSwing(result.swing)}`,
    "",
    "状态落点：",
    ...result.stateLandings.map(formatStateLanding),
    "",
    "后果力度：",
    ...uniqueLines(result.consequenceGuidance).map((line) => `- ${line}`),
    "",
    "叙事约束：",
    ...uniqueLines([...result.narrativeConstraints, noNumberNarrativeHint()]).map((line) => `- ${line}`),
    "",
    "禁止写法：",
    ...uniqueLines(result.forbiddenNarration).map((line) => `- ${line}`),
    "",
    `下一行动窗口：${result.nextActionWindow}`,
    ...(recordedObligations > 0
      ? [
          "",
          `⚠ 已登记 ${recordedObligations} 条必须落地的义务；本轮 canonical commit（commit_turn / progress_scene_beat）前必须用对应状态事件清账，否则提交会被拒绝。`,
        ]
      : []),
  ].join("\n");
}

function formatStateLanding(landing: CombatStateLanding): string {
  const strength = landing.required ? "必须" : "可选";
  return `- ${strength} ${landing.kind}: ${landing.reason}`;
}

function rollCombatSwing(draft: State): CombatSwing {
  const roll = seededRandomInt(draft, 100);
  if (roll < 10) return "bad-break";
  if (roll < 30) return "pressure";
  if (roll < 70) return "neutral";
  if (roll < 90) return "opening";
  return "turnabout";
}

function uniqueLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      unique.push(trimmed);
    }
  }
  return unique;
}

export const resolveCombatExchangeToolDefinition: FateToolDefinition = {
  name: "resolve_combat_exchange",
  description:
    "裁决当前战斗交锋窗口；比较 Fate 参数/尺度、资源投入、已知优势/劣势和伤势压力，返回结果 band 与必须落地的状态约束。必须落地项会登记为义务账本，提交 turn 前必须清账。\n\n" +
    "【使用边界】\n" +
    "- 战斗、撤退、保护、破除拘束、试探能力、宝具解放等高风险交锋\n" +
    "- 双方存在参数、伤势、地形、情报或资源投入差异，不能只靠口头裁决\n" +
    "- 可变评级宝具必须指定本次释放档位\n\n" +
    "【严禁】\n" +
    "- 一次结算完整战斗\n" +
    "- 把 outcome 当成自动状态变更\n" +
    "- 输出 HP、内部 score、DC 或未揭示秘密",
  parameters: Type.Object({
    actorId: Type.String({ description: "本方 actor id" }),
    opponentId: Type.String({ description: "主要对手 actor id" }),
    intent: Type.String({ description: "当前动作意图" }),
    tactic: Type.String({
      description:
        "direct-attack / defense / escape / protect / probe / break-restraint / noble-phantasm / support",
    }),
    actorParameter: Type.String({
      description: "strength / endurance / agility / mana / luck / noblePhantasm",
    }),
    opponentParameter: Type.String({
      description: "strength / endurance / agility / mana / luck / noblePhantasm",
    }),
    actorNoblePhantasmName: Type.Optional(
      Type.String({
        description: "本方公开宝具名；只有一个公开宝具时可省略",
      }),
    ),
    opponentNoblePhantasmName: Type.Optional(
      Type.String({
        description: "对手公开宝具名；只有一个公开宝具时可省略",
      }),
    ),
    actorNoblePhantasmRelease: Type.Optional(
      Type.String({
        description: "本方可变评级宝具本次释放档位；必须在公开范围内",
      }),
    ),
    opponentNoblePhantasmRelease: Type.Optional(
      Type.String({
        description: "对手可变评级宝具本次释放档位",
      }),
    ),
    targetObjective: Type.Optional(
      Type.String({ description: "若服务当前 Scene Objective，逐字写目标摘要" }),
    ),
    committedResources: Type.Optional(
      Type.Array(
        Type.String({
          description: "已投入的资源、技能、令咒风险、宝具或地形布置",
        }),
      ),
    ),
    knownAdvantages: Type.Optional(
      Type.Array(Type.String({ description: "玩家可见或工具已确认的有利事实" })),
    ),
    knownDisadvantages: Type.Optional(
      Type.Array(
        Type.String({
          description: "玩家可见或工具已确认的不利事实、伤势、距离、压制或未知能力",
        }),
      ),
    ),
    riskTolerance: Type.String({ description: "low / medium / high / desperate" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    resolveCombatExchangeTool(params, ctx.sessionManager),
};
