import type { TurnCommitEvent } from "../../engine/core/turn/turn-commit.ts";
import type { FateToolDefinition } from "../runtime/tool-definition.ts";
import type { ToolResult } from "../runtime/tool-result.ts";

import { Type } from "typebox";

import {
  assertNoOpenBackstageObligation,
  recordCanonicalTurnForBackstage,
} from "../../engine/core/backstage/backstage-obligation.ts";
import { formatPendingHarvestReminder } from "../../engine/core/backstage/backstage-pending.ts";
import { commitTurn } from "../../engine/core/turn/turn-commit.ts";
import { normalizeTurnCommitInput } from "./commit-turn-normalizer.ts";
import { commitTurnEventsToolSchema } from "./commit-turn-tool-schema.ts";
import { resultDetails, runDomainEventTool } from "./domain-tool-runner.ts";
import { timePolicySchema } from "./time-policy-tool-schema.ts";

// 本轮是否产生机械代价：用于打断后台 no-cost 连击。可检测核心集。
const COST_EVENT_KINDS = new Set(["actor-condition", "economy", "servant-form"]);
function turnHasCost(events: readonly TurnCommitEvent[]): boolean {
  return events.some((event) => {
    if (COST_EVENT_KINDS.has(event.kind)) {
      return true;
    }
    if (
      event.kind === "scene" &&
      (event.event.kind === "add-threat" ||
        // beat 转换是有代价的 canonical 动作（旧 progress_scene_beat 语义：hasCost 恒真）
        event.event.kind === "begin-beat" ||
        event.event.kind === "complete-beat")
    ) {
      return true;
    }
    // memory 中只有 record-major-event 才计入 cost（重大事件=有代价）；
    // record-daily-event 等轻量笔记不算机械动作。
    return event.kind === "memory" && event.event.kind === "record-major-event";
  });
}

// beat 收口不再是独立工具；complete-beat scene 子事件就是 beat 边界信号。
function turnHasBeatBoundary(events: readonly TurnCommitEvent[]): boolean {
  return events.some((event) => event.kind === "scene" && event.event.kind === "complete-beat");
}

export function commitTurnTool(params: unknown, sessionManager: unknown): ToolResult {
  const input = normalizeTurnCommitInput(params);
  return runDomainEventTool({
    sessionManager,
    execute: (draft) => {
      // 延迟硬阻断：上一轮触发的后台推进义务未完成时拒绝本次 canonical turn。
      assertNoOpenBackstageObligation(draft);
      const result = commitTurn(draft, input);
      recordCanonicalTurnForBackstage(draft, {
        elapsedMinutes: input.time.elapsedMinutes,
        hasCost: turnHasCost(input.events),
        beatBoundary: turnHasBeatBoundary(input.events),
      });
      return { result, pendingReminder: formatPendingHarvestReminder(draft) };
    },
    details: ({ result }) => resultDetails(result),
    message: ({ result, pendingReminder }) =>
      pendingReminder === null ? result.message : `${result.message}\n\n${pendingReminder}`,
  });
}

export const commitTurnToolDefinition: FateToolDefinition = {
  name: "commit_turn",
  description:
    "每轮叙事结束时一次性提交本轮所有状态变化。把这轮里发生的各种变化——经济收支、记忆记录、角色状态、场景更新、beat 开启/收口——打包放进 events 数组。\n\n" +
    "时间推进：顶层 time 必填（elapsedMinutes >= 1），时间独立于 events；地点移动用 time.kind=travel。\n\n" +
    "events 示例：\n" +
    '  { kind: "economy", event: { kind: "spend-money", purseId: "...", amount: 900, reason: "买药" } }\n' +
    '  { kind: "memory", event: { kind: "record-daily-event", eventKind: "shopping", title: "...", summary: "..." } }\n' +
    '  { kind: "scene", event: { kind: "begin-beat", title: "潜入柳洞寺", purpose: "...", objectives: [...] } }\n' +
    '  { kind: "scene", event: { kind: "complete-beat", outcome: "...", nextBeat: {...} } }\n\n' +
    "【使用边界】\n" +
    "- 每次 canonical turn 都必须提交顶层 time\n" +
    "- Scene Beat 开启/收口用 scene 子事件 begin-beat / complete-beat（唯一方式），可与其他 events 同轮提交\n" +
    "- objectives/threats 是 beat-scoped：resolve-objective 不能解决最后一个目标，收口用 complete-beat\n" +
    "- resolve_combat_exchange 登记的义务必须在本次 events 里落地\n\n" +
    "禁区：\n" +
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
    events: commitTurnEventsToolSchema(),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    commitTurnTool(params, ctx.sessionManager),
};
