import type { FateToolDefinition } from "../runtime/tool-definition.ts";

import { Type } from "typebox";

import { assertNonEmptyString, isRecord } from "../../engine/core/typebox-validation.ts";
import { lookupWorldData } from "../../engine/world-data/lookup.ts";
import { textResult, type ToolResult } from "../runtime/tool-result.ts";

export function lookupTool(params: unknown): ToolResult {
  const query = assertNonEmptyString(isRecord(params) ? params["query"] : undefined, "query");
  const result = lookupWorldData({ query });
  return textResult(result.text);
}

export const lookupToolDefinition: FateToolDefinition = {
  name: "lookup",
  description:
    "查询型月世界的权威设定——角色、从者、地点、概念、时间线的唯一数据入口。默认跨全库搜索；支持单关键词，也支持用空格/逗号分隔的少量关键词（如“绫香 沙条 Fate strange Fake”“两仪式 空之境界”）。\n\n" +
    "【必须调用的场景】\n" +
    "- 玩家遇到或提及任何预设角色/从者/NPC——必须先查再叙述\n" +
    "- 玩家进入预设地点——先查地点设定再描述环境\n" +
    "- 需要引用型月世界观概念（圣杯、魔术、英灵等）\n" +
    "- 当前场景涉及憑依、伪装、身份分裂、外观错位、镜像/自我认知、特殊召唤、公开名/真名分离、跨世界身份或 NPC 是否知道某事实——先查本地；若本地条目没写清身份层、外观层、知识边界、时点，再继续外部 canon research\n\n" +
    "【严禁的行为】\n" +
    "- 凭记忆编造角色外貌/性格/背景\n" +
    "- 即兴发明型月设定\n" +
    "- 用一句粗略摘要填补复杂 canon 细节；不知道外观、时点、身份主体或知识边界时必须继续查证",
  parameters: Type.Object({
    query: Type.String({
      description: "搜索关键词——角色名、地点名、概念名等；多关键词用空格分隔，不要写整句",
    }),
  }),
  execute: async (_toolCallId, params) => lookupTool(params),
};
