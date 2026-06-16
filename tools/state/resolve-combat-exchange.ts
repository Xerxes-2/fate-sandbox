import type { FsnToolDefinition } from "../runtime/tool-definition.ts";
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

export const resolveCombatExchangeToolDefinition: FsnToolDefinition = {
  name: "resolve_combat_exchange",
  description:
    "定性裁决当前战斗交锋窗口；比较 Fate 参数/尺度、资源投入、已知优势/劣势和伤势压力，返回结果 band 与必须落地的状态约束。不写 HP；必须落地项会登记为义务账本，commit_turn / progress_scene_beat 前必须用对应状态事件清账，否则提交被拒。\n\n" +
    "【必须调用的场景】\n" +
    "- 战斗、撤退、保护、破除拘束、试探能力、宝具前摇/解放等高风险交锋需要机械裁决\n" +
    "- 双方有从者参数、魔术资质、伤势、地形、情报或资源投入差异，不能只靠 GM 口胡胜负\n" +
    "- 玩家行动试图争取局部目标：挡下一击、逼退、撤离、保护 NPC、打断术式、识破能力或创造出手机会\n" +
    "- 工具会自动加入战场变数，等级压制不是静态锁死；变数只能兑现为局部窗口、资源交换或后果扩大\n" +
    "- tactic=noble-phantasm 且比较 noblePhantasm 时，具体宝具 rank 与面板宝具参数分开；多宝具必须指定公开宝具名\n" +
    "- canon 参数语义由引擎自动处理：「+」只在触发窗口（宝具释放/有利变数）瞬间倍化且必须留代价；「-」按不安定低一级计；EX 规格外不按数值压制（宝具栏 EX 除外）；unknown 参数走中性裁决\n" +
    "- 可变评级宝具（rank 为 X~Y）必须用 actorNoblePhantasmRelease / opponentNoblePhantasmRelease 指定本次释放档位\n\n" +
    "【严禁的行为】\n" +
    "- 用它一次结算完整战斗或跳过自然可接续的新局面\n" +
    "- 把交锋结果写成原地僵持；每次结果都必须改变位置、距离、资源、情报、阵型或目标进度\n" +
    "- 让模型先决定胜负再反填优势/劣势；输入必须是玩家可见事实、已投入资源和已知压力\n" +
    "- 把 outcome 当成自动状态变更；伤势、魔力、目标、记忆、秘密揭示仍必须用对应领域工具落地\n" +
    "- 输出内部 score、HP、DC 或未揭示真名/宝具/弱点给玩家",
  parameters: Type.Object({
    actorId: Type.String({ description: "发起/承受当前交锋动作的 actor id" }),
    opponentId: Type.String({ description: "主要对手 actor id" }),
    intent: Type.String({ description: "当前动作意图，如 破除拘束 / 护住绫香撤退 / 逼退 Rider" }),
    tactic: Type.String({
      description:
        "允许: direct-attack / defense / escape / protect / probe / break-restraint / noble-phantasm / support",
    }),
    actorParameter: Type.String({
      description:
        "本方主要参数轴，允许: strength / endurance / agility / mana / luck / noblePhantasm",
    }),
    opponentParameter: Type.String({
      description:
        "对手主要参数轴，允许: strength / endurance / agility / mana / luck / noblePhantasm",
    }),
    actorNoblePhantasmName: Type.Optional(
      Type.String({
        description: "本方明确释放具体宝具时，逐字复制公开宝具名；若只有一个公开宝具可省略。",
      }),
    ),
    opponentNoblePhantasmName: Type.Optional(
      Type.String({
        description: "对手明确使用具体宝具时，逐字复制公开宝具名；若只有一个公开宝具可省略。",
      }),
    ),
    actorNoblePhantasmRelease: Type.Optional(
      Type.String({
        description:
          "本方宝具为可变评级（如 E~A++）时必填：本次释放的实际档位（单一 Fate rank，须在范围内）；档位越高魔力代价越重。",
      }),
    ),
    opponentNoblePhantasmRelease: Type.Optional(
      Type.String({
        description: "对手宝具为可变评级时必填：对手本次释放的实际档位。",
      }),
    ),
    targetObjective: Type.Optional(
      Type.String({ description: "若交锋服务当前 Scene Objective，逐字写目标摘要" }),
    ),
    committedResources: Type.Optional(
      Type.Array(
        Type.String({
          description: "已明确投入的资源、技能、令咒风险、宝具、地形布置等；无则省略",
        }),
      ),
    ),
    knownAdvantages: Type.Optional(
      Type.Array(Type.String({ description: "玩家可见或工具已确认的有利事实；不要写幕后秘密" })),
    ),
    knownDisadvantages: Type.Optional(
      Type.Array(
        Type.String({
          description: "玩家可见或工具已确认的不利事实、伤势、距离、压制、未知能力等",
        }),
      ),
    ),
    riskTolerance: Type.String({ description: "允许: low / medium / high / desperate" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    resolveCombatExchangeTool(params, ctx.sessionManager),
};
