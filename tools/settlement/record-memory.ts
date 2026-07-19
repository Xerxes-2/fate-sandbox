import type { MemoryEvent, MemoryEventResult } from "../../engine/core/memory/memory.ts";
import type { FateToolDefinition } from "../runtime/tool-definition.ts";
import type { ToolResult } from "../runtime/tool-result.ts";

import { Type } from "typebox";

import { parseMemoryEvent } from "../../engine/core/memory/memory-schema.ts";
import { recordMemory } from "../../engine/core/memory/memory.ts";
import { isRecord } from "../../engine/core/utils/typebox-validation.ts";
import { runDomainEventTool } from "./domain-tool-runner.ts";

export function recordMemoryTool(params: unknown, sessionManager: unknown): ToolResult {
  return runDomainEventTool({
    sessionManager,
    execute: (draft) => {
      const event = parseMemoryEvent(normalizeSourceEventId(params), "record_memory 参数");
      return { event, result: recordMemory(draft, event) };
    },
    details: ({ result }) => ({ result }),
    message: ({ event, result }) => formatResult(event, result),
  });
}

function formatResult(params: MemoryEvent, result: MemoryEventResult): string {
  switch (params.kind) {
    case "pin-fact":
      return `长期事实已记录：${result.factId ?? "?"}\n- ${params.text}`;
    case "record-major-event":
      return `重大事件已记录：${result.eventId ?? "?"}\n- ${params.title}: ${params.summary}`;
    case "record-daily-summary":
      return `日常摘要已记录：${result.dailySummaryId ?? "?"}\n- ${params.summary}`;
    case "record-daily-event":
      return `日常事件已记录：${result.dailyEventId ?? "?"}\n- [${params.eventKind}] ${params.title}: ${params.summary}`;
    default: {
      const unreachable: never = params;
      throw new Error(`未知 memory 事件：${JSON.stringify(unreachable)}`);
    }
  }
}

/** pin-fact 的 sourceEventId 容错：缺失/空白一律归一为 null——领域归一化，不是校验。 */
function normalizeSourceEventId(params: unknown): unknown {
  if (!isRecord(params) || params["kind"] !== "pin-fact") {
    return params;
  }
  const raw = params["sourceEventId"];
  const sourceEventId = typeof raw === "string" && raw.trim().length > 0 ? raw : null;
  return { ...params, sourceEventId };
}

export const recordMemoryToolDefinition: FateToolDefinition = {
  name: "record_memory",
  description:
    "写入玩家已知的记忆。重大变化用 record-major-event + claims（非 mundane 类 claim 必须提供证据或 secret 关联）；单项日常记录用 record-daily-event；日终摘要用 record-daily-summary；长期事实钉用 pin-fact。\n\n" +
    "【使用边界】\n" +
    "- 重大变化（身世/契约/生死/真名/宝具/令咒/阵营/永久缺损等可信度很重要的事件）：record-major-event + claims\n" +
    "- 单项日常事件（采购/会面/移动/观察/关系互动等不需要审计的笔记）：record-daily-event + eventKind 分类\n" +
    "- 半天以上跳过、日终/章节摘要：record-daily-summary\n" +
    "- 离散事实钉（玩家身份/已知盟友名单等长期稳定事实）：pin-fact\n\n" +
    "禁区：\n" +
    "- 记 GM 猜测、幕后真相、闲聊或短暂情绪\n" +
    "- 把玩家未确认秘密写进 public memory\n" +
    "- 非 mundane claim 缺 evidence/relatedSecretSlotIds 却标 confirmed/observed/inferred\n" +
    "- 用 record-daily-summary 或 record-daily-event 绕过 claims 记重大事件",
  parameters: Type.Object({
    kind: Type.String({
      description:
        "允许: pin-fact / record-major-event / record-daily-event / record-daily-summary",
    }),
    scope: Type.Optional(
      Type.String({ description: "可选范围，允许: protagonist / npc / faction / world" }),
    ),
    subject: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    sourceEventId: Type.Optional(Type.String()),
    claims: Type.Optional(
      Type.Array(
        Type.Object({
          kind: Type.String({
            description:
              "claim 类型（仅 record-major-event 必填）。mundane=无需 secret 关联的普通事实；日常事件使用 record-daily-event。其余允许: identity / location / affiliation / motive / ability / resource / relationship / event-cause / world-fact",
          }),
          statement: Type.String(),
          certainty: Type.String({
            description: "证据确信度，允许: observed / confirmed / inferred / rumor / hypothesis",
          }),
          subjectId: Type.Optional(Type.String()),
          relatedSecretSlotIds: Type.Optional(Type.Array(Type.String())),
          evidence: Type.Optional(Type.String()),
        }),
      ),
    ),
    eventKind: Type.Optional(
      Type.String({
        description:
          "record-daily-event 必填：日常事件类型。允许: mundane / relationship / location / shopping / meeting / travel / observation",
      }),
    ),
    title: Type.Optional(
      Type.String({ description: "record-major-event / record-daily-event 必填：事件标题" }),
    ),
    summary: Type.Optional(
      Type.String({
        description:
          "record-major-event / record-daily-event / record-daily-summary 必填：事件描述",
      }),
    ),
    consequences: Type.Optional(Type.Array(Type.String())),
    startDate: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.String()),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    recordMemoryTool(params, ctx.sessionManager),
};
