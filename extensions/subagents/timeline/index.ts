import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { lookupTool } from "../../../tools/lookup/lookup.ts";

/**
 * showrunner 审计子进程的运行时 extension：只提供 lookup 工具。
 *
 * 引擎用 `--no-extensions -e <本文件> --no-builtin-tools` 拉起审计子进程
 * （engine/core/showrunner/showrunner-spawn.ts，ADR 0007），所以 child 唯一的
 * 工具就是这里注册的 lookup。<timeline_state_context> 由引擎在拼 audit prompt
 * 时直接内嵌（showrunner-context-block.ts），不走任何侧通道。
 */
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
