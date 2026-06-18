import type { FateToolDefinition } from "../runtime/tool-definition.ts";
import { Type } from "typebox";
import { timePolicySchema } from "./time-policy-tool-schema.ts";
import { commitTurn } from "../../engine/core/turn-commit.ts";
import type { ToolResult } from "../runtime/tool-result.ts";

import { resultDetails, runDomainEventTool } from "./domain-tool-runner.ts";
import { normalizeTurnCommitInput } from "./commit-turn-normalizer.ts";

export function commitTurnTool(params: unknown, sessionManager: unknown): ToolResult {
  return runDomainEventTool({
    sessionManager,
    execute: (draft) => commitTurn(draft, normalizeTurnCommitInput(params)),
    details: resultDetails,
    message: (result) => result.message,
  });
}

export const commitTurnToolDefinition: FateToolDefinition = {
  name: "commit_turn",
  description:
    "每轮叙事结束时一次性提交本轮领域事件。用于一轮内聚合多个状态变化。\n\n" +
    "【使用边界】\n" +
    "- 每次 canonical turn 都必须提交顶层 time\n" +
    "- 一轮内同时改变时间、地点、目标、伤势、物品、资金、记忆或从者资源\n" +
    "- Scene Beat 开启/收口优先用 progress_scene_beat\n" +
    "- resolve_combat_exchange 登记的义务必须在本次 events 里落地\n\n" +
    "【严禁】\n" +
    "- 把它当裸 patch\n" +
    "- 在 events 里写时间或移动\n" +
    "- 提交隐藏事实到 public\n" +
    "- 同一回复连续提交多个前台 canonical turn",
  parameters: Type.Object({
    summary: Type.Optional(
      Type.String({
        description: "本轮玩家可见状态变化摘要；省略时自动生成",
      }),
    ),
    time: timePolicySchema(),
    events: Type.Array(
      Type.Object({
        kind: Type.String({
          description:
            "scene / scene-presence / actor-condition / servant-form / economy / memory",
        }),
        event: Type.Unknown({
          description:
            "对应领域事件载荷；scene event 不包含时间/移动；resolve-objective 只用于当前目标",
        }),
      }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    commitTurnTool(params, ctx.sessionManager),
};
