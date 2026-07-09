/**
 * Showrunner Projection context block (semi-privileged read model — see CONTEXT.md).
 *
 * canonical state 只活在主进程内存 + session entries 里；审计子进程是独立 pi 进程，
 * 看不到这两者。引擎在拼 audit prompt 时把调用瞬间的投影直接内嵌为
 * `<timeline_state_context>`：零文件、零 env、secrets 过滤留在父侧
 * （投影含 hidden-canonical 摘要，但绝不含 actorSecrets/secretEventLog/campaignSecrets 原文）。
 */

import { buildTimelineStateContextFromRaw } from "../state/state-file-projection.ts";

export function buildTimelineStateContextBlock(rawState: unknown): string {
  const context = buildTimelineStateContextFromRaw(rawState);
  return [
    "<timeline_state_context>",
    "以下是当前 canonical state 的审计安全摘要（Showrunner Projection），由引擎在调用瞬间注入；不要要求主 GM 重复提供，也不要把本段原样写给玩家。",
    "actor.agenda / actor.knowledgeLens 是 NPC 主动性与认知边界账本；relationshipSignals 是关系行为证据账本；可用于判断 NPC 自主行动和关系代价，但不得把 hidden knowledge 或 secret signals 原样写成玩家可见文本。",
    "所有输出 timeRange.start/end 必须是 ISO UTC 字符串；displayTime 只是本地展示时间，不得把本地时钟当 UTC。timeRange.end 不得晚于 currentAt。",
    JSON.stringify(context, null, 2),
    "</timeline_state_context>",
  ].join("\n");
}
