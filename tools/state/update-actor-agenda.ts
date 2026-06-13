import type { FsnToolDefinition } from "../runtime/tool-definition.ts";
import type { ToolResult } from "../runtime/tool-result.ts";

import { Type } from "typebox";
import { Compile } from "typebox/compile";

import {
  clearActorAgenda,
  markActorIndependentAction,
  upsertActorAgenda,
} from "../../engine/core/actor-agenda.ts";
import type { ActorAgendaState, State } from "../../engine/core/state.ts";
import {
  assertIsoDateString,
  assertNonEmptyString,
  isRecord,
  parseTypeBoxValue,
} from "../../engine/core/typebox-validation.ts";

import { runDomainEventTool } from "./domain-tool-runner.ts";

const UPDATE_ACTOR_AGENDA_KINDS = ["upsert", "mark-independent-action", "clear"] as const;

type UpdateActorAgendaResult =
  | { kind: "upsert"; agenda: ActorAgendaState }
  | { kind: "mark-independent-action"; agenda: ActorAgendaState }
  | { kind: "clear"; agenda: ActorAgendaState; reason: string };

export function updateActorAgendaTool(params: unknown, sessionManager: unknown): ToolResult {
  return runDomainEventTool({
    sessionManager,
    execute: (draft) => executeUpdateActorAgenda(draft, params),
    details: (result) => ({ result }),
    message: formatResult,
  });
}

function executeUpdateActorAgenda(draft: State, params: unknown): UpdateActorAgendaResult {
  if (!isRecord(params)) {
    throw new Error("update_actor_agenda 参数必须是对象。");
  }
  const kind = assertNonEmptyString(params["kind"], "kind");
  switch (kind) {
    case "upsert": {
      const input = parseTypeBoxValue(params, "upsert 参数", UPSERT_VALIDATOR);
      const agenda = upsertActorAgenda(draft, {
        actorId: input.actorId,
        goal: input.goal,
        fear: input.fear,
        currentOrder: normalizeNullableString(input.currentOrder, "currentOrder"),
        lastIndependentActionAt: normalizeOptionalIso(input.lastIndependentActionAt),
      });
      return { kind, agenda };
    }
    case "mark-independent-action": {
      const input = parseTypeBoxValue(params, "mark-independent-action 参数", MARK_VALIDATOR);
      const agenda = markActorIndependentAction(
        draft,
        input.actorId,
        normalizeNullableString(input.currentOrder, "currentOrder"),
      );
      return { kind, agenda };
    }
    case "clear": {
      const input = parseTypeBoxValue(params, "clear 参数", CLEAR_VALIDATOR);
      const agenda = clearActorAgenda(draft, input.actorId);
      return { kind, agenda, reason: input.reason };
    }
    default:
      throw new Error(
        `不支持的 kind: ${kind}。允许: ${UPDATE_ACTOR_AGENDA_KINDS.join(" / ")}。`,
      );
  }
}

function normalizeOptionalIso(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return assertIsoDateString(value, "lastIndependentActionAt");
}

function normalizeNullableString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return assertNonEmptyString(value, fieldName);
}

function formatResult(result: UpdateActorAgendaResult): string {
  switch (result.kind) {
    case "upsert":
      return `NPC 主动性账本已更新：${formatAgenda(result.agenda)}`;
    case "mark-independent-action":
      return `NPC 自主行动已记账：${formatAgenda(result.agenda)}`;
    case "clear":
      return `NPC 主动性账本已移除：${result.agenda.actorId}（${result.reason}）`;
  }
}

function formatAgenda(agenda: ActorAgendaState): string {
  const order = agenda.currentOrder === null ? "无当前指令" : agenda.currentOrder;
  const acted = agenda.lastIndependentActionAt === null ? "尚无自主行动记录" : agenda.lastIndependentActionAt;
  return `${agenda.actorId}｜goal=${agenda.goal}｜fear=${agenda.fear}｜order=${order}｜last=${acted}`;
}

const UPSERT_SCHEMA = Type.Object({
  kind: Type.Literal("upsert"),
  actorId: Type.String({ minLength: 1 }),
  goal: Type.String({ minLength: 1 }),
  fear: Type.String({ minLength: 1 }),
  currentOrder: Type.Optional(Type.Unknown()),
  lastIndependentActionAt: Type.Optional(Type.Unknown()),
});

const MARK_SCHEMA = Type.Object({
  kind: Type.Literal("mark-independent-action"),
  actorId: Type.String({ minLength: 1 }),
  currentOrder: Type.Optional(Type.Unknown()),
});

const CLEAR_SCHEMA = Type.Object({
  kind: Type.Literal("clear"),
  actorId: Type.String({ minLength: 1 }),
  reason: Type.String({ minLength: 1 }),
});

const UPSERT_VALIDATOR = Compile(UPSERT_SCHEMA);
const MARK_VALIDATOR = Compile(MARK_SCHEMA);
const CLEAR_VALIDATOR = Compile(CLEAR_SCHEMA);

export const updateActorAgendaToolDefinition: FsnToolDefinition = {
  name: "update_actor_agenda",
  description:
    "记录或更新 NPC/势力代理人的主动性账本（secret state）：目标、恐惧、当前指令与最近自主行动时间。它不是玩家可见关系摘要，而是防止 NPC 退化成等待物/线索容器的后台账本。\n\n" +
    "【必须调用的场景】\n" +
    "- 重要 NPC 或阵营代理人开始一条可持续行动线：kind=upsert，写 goal/fear/currentOrder\n" +
    "- NPC 在玩家视野外或玩家场景边缘做出自主行动：kind=mark-independent-action，自动用当前游戏时钟登记 lastIndependentActionAt\n" +
    "- 当前目标/命令/恐惧发生实质变化：kind=upsert 覆盖旧账本\n" +
    "- NPC 退出本局跟踪、死亡、离开舞台或行动线终结：kind=clear，给 reason\n\n" +
    "【严禁的行为】\n" +
    "- 把 agenda 内容直接写给玩家；它是 GM/子代理用的隐藏主动性账本\n" +
    "- 用空泛 goal（例如“制造剧情张力”）；必须是角色或阵营在世界内想达成的事\n" +
    "- 让重要 NPC 连续多轮只等待玩家询问；要么 mark-independent-action，要么降权/退场/改写目标",
  parameters: Type.Object({
    kind: Type.String({ description: "允许: upsert / mark-independent-action / clear" }),
    actorId: Type.String({ description: "目标 actor id；必须已存在于 public actors" }),
    goal: Type.Optional(Type.String({ description: "upsert 必填：此刻主动追求什么" })),
    fear: Type.Optional(Type.String({ description: "upsert 必填：此刻最怕什么代价/暴露/失败" })),
    currentOrder: Type.Optional(
      Type.Unknown({ description: "upsert/mark 可选：当前指令；无指令填 null 或省略" }),
    ),
    lastIndependentActionAt: Type.Optional(
      Type.Unknown({ description: "upsert 可选：ISO 时刻；省略/null 表示尚无记录" }),
    ),
    reason: Type.Optional(Type.String({ description: "clear 必填：为什么不再跟踪该 agenda" })),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
    updateActorAgendaTool(params, ctx.sessionManager),
};
