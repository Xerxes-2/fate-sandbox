import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { lookupTool } from "../../../tools/lookup/lookup";

export default function timelineSubagentsExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "lookup",
    label: "lookup",
    description:
      "查询型月世界的权威设定。仅用于 subagent 核对当前世界线相关公开设定；不要用它读取或修改 canonical state。",
    parameters: Type.Object({
      query: Type.String({
        description: "搜索关键词——角色名、地点名、概念名等；多关键词用空格分隔，不要写整句。",
      }),
    }),
    execute: async (_toolCallId, params) => lookupTool(params),
  });
}
