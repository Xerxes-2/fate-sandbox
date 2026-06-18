import type { FateToolDefinition } from "../runtime/tool-definition.ts";
import { Type } from "typebox";
import { updateActorCondition } from "../../engine/core/actor-condition.ts";
import type { ToolResult } from "../runtime/tool-result.ts";

import { resultDetails, runDomainEventTool } from "./domain-tool-runner.ts";
import { normalizeActorConditionEvent } from "./actor-condition-normalizer.ts";

export function updateActorConditionTool(params: unknown, sessionManager: unknown): ToolResult {
  return runDomainEventTool({
    sessionManager,
    execute: (draft) => updateActorCondition(draft, normalizeActorConditionEvent(params)),
    details: resultDetails,
    message: (result) => result.message,
  });
}


export const updateActorConditionToolDefinition: FateToolDefinition = {
  name: "update_actor_condition",
  description:
    "更新 actor 的伤势、异常、长期影响、外观装备或 tracked item。\n\n" +
    "【使用边界】\n" +
    "- 受伤、感染、诅咒、永久影响、治疗进度、恢复或稳定\n" +
    "- 外观/服装变化用 change-outfit\n" +
    "- 关键物跨 actor 转移、状态变化或加入 trackedItems\n" +
    "- 非从者 actor 的魔术回路或 Od 状态变化\n\n" +
    "【严禁】\n" +
    "- 改写锁定身份事实、真名或基础参数\n" +
    "- 用通用 HP 百分比代替离散伤势\n" +
    "- 声称 Od / 魔力变化却不更新 circuits\n" +
    "- 把普通消耗品和临时杂物塞进 trackedItems",
  parameters: Type.Object({
    kind: Type.String({
      description:
        "add-wound / update-wound / add-affliction / add-permanent-effect / update-magecraft-circuits / resolve-condition / change-outfit / update-outfit(alias) / change-clothes(alias) / transfer-tracked-item / update-tracked-item / add-tracked-item",
    }),
    actorId: Type.Optional(Type.String()),
    severity: Type.Optional(
      Type.String({ description: "minor / moderate / severe / critical" }),
    ),
    text: Type.Optional(Type.String()),
    source: Type.Optional(Type.String()),
    recoverable: Type.Optional(Type.Boolean()),
    expectedDuration: Type.Optional(Type.Unknown({ description: "预计持续时间或 null" })),
    mechanicalEffect: Type.Optional(Type.String()),
    circuits: Type.Optional(
      Type.Object({
        count: Type.String({ description: "魔术回路数量摘要" }),
        quality: Type.String({ description: "Fate rank 或 none" }),
        od: Type.Integer({ description: "0-100 Od / 人类魔力余量" }),
        status: Type.String({
          description: "normal / overheated / depleted / dormant / damaged",
        }),
        traits: Type.Array(Type.String()),
      }),
    ),
    outfit: Type.Optional(
      Type.Object({
        label: Type.String({ description: "外观/服装标签" }),
        details: Type.String({ description: "可见细节" }),
      }),
    ),
    itemId: Type.Optional(Type.String()),
    holderActorId: Type.Optional(Type.Unknown({ description: "持有者 actorId 或 null" })),
    ownerActorId: Type.Optional(Type.Unknown({ description: "所有者 actorId 或 null" })),
    label: Type.Optional(Type.String({ description: "add-tracked-item 必填：玩家可见标签" })),
    itemKind: Type.Optional(
      Type.String({
        description: "mundane / weapon / mystic-code / document / key-item / other",
      }),
    ),
    condition: Type.Optional(
      Type.String({ description: "intact / damaged / broken / spent / unknown" }),
    ),
    visibility: Type.Optional(Type.String({ description: "player-known / suspected" })),
    notes: Type.Optional(Type.Array(Type.String())),
    treatment: Type.Optional(Type.String({ description: "update-wound 可用：当前处理状态" })),
    conditionKind: Type.Optional(Type.String({ description: "resolve-condition：wound / affliction" })),
    conditionId: Type.Optional(Type.String()),
    outcome: Type.Optional(
      Type.String({
        description: "resolve-condition：recovered / stabilized；其它 kind 不用写",
      }),
    ),
    reason: Type.Optional(Type.String()),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    updateActorConditionTool(params, ctx.sessionManager),
};
