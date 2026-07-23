/**
 * 型月（Type-Moon / Fate）世界观沙盒 — pi extension
 *
 * DeepSeek V4 特化：系统提示极简 + 上下文/铁则注入 user 消息流 + 全链路中文
 */

import type { ContextEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { syncStateFromSessionManager } from "./engine/core/state/session-hydration.ts";
import { isRecord } from "./engine/core/utils/typebox-validation.ts";
import { beginTurnTrace, dumpChronologyAnomalies, dumpPassA } from "./engine/debug/api-trace.ts";
import { maybeForceCompact } from "./engine/debug/force-compact.ts";
import {
  buildSettlementSystemPrompt,
  injectGmPromptMessages,
} from "./engine/prompt-assembly/injection.ts";
import { projectSettlementWorkingSet } from "./engine/prompt-assembly/settlement-working-set.ts";
import { stripLeakedSettlementProse } from "./engine/render/settlement-prose-firewall.ts";
import {
  projectSessionChronology,
  PROSE_CUSTOM_TYPE,
} from "./engine/session-chronology/session-chronology.ts";
import { registerAllTools, toolResultRetention } from "./tools/registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function extension(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => {
    return { skillPaths: [join(__dirname, "skills")] };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    beginTurnTrace(new Date().toISOString());
    // Dev 开关：回合开始前强制触发一次压缩，演练 compaction-policy 的确定性接管路径。
    maybeForceCompact(ctx);
    return { systemPrompt: buildSettlementSystemPrompt(event.systemPromptOptions) };
  });

  pi.on("context", async (event, ctx) => {
    const hasInitializedState = syncStateFromSessionManager(ctx.sessionManager);
    // 结算器（Pass A）投影：渲染产物不作为对话流消息进结算上下文，但最后一轮渲染正文
    // 作为物理连续性锚注入 pre-response slot，防止跨轮物理状态断裂。
    const workingSet = projectSettlementWorkingSet(event.messages, toolResultRetention);
    const chronology = projectSessionChronology(
      { kind: "session-branch", entries: ctx.sessionManager.getBranch() },
      { kind: "settlement" },
    );
    dumpChronologyAnomalies("settlement-continuity", chronology.anomalies);
    if (chronology.kind === "blocked") {
      throw new Error(
        `Session Chronology blocked settlement continuity: ${chronology.anomalies.map((entry) => entry.kind).join(", ")}`,
      );
    }
    const lastRenderedProse = chronology.value.latestNarrativeProse;
    const settlementMessages = workingSet
      .filter((message) => !(isRecord(message) && message["customType"] === PROSE_CUSTOM_TYPE))
      // 在此过滤 message_end 上线前已写入历史的结算器误写正文：只整形
      // 传给结算模型的 per-call 视图，不改存档。新存档由 message_end 源头收口，
      // 这层负责处理老存档，二者互补。
      .map((message) => stripLeakedSettlementProse(message) ?? message);
    const injected = injectGmPromptMessages<ContextEvent["messages"][number]>(settlementMessages, {
      hasInitializedState,
      lastRenderedProse,
    });
    dumpPassA(ctx.getSystemPrompt(), injected);
    return { messages: injected };
  });

  pi.on("session_start", async (_event, ctx) => {
    syncStateFromSessionManager(ctx.sessionManager);
  });

  pi.on("session_tree", async (_event, ctx) => {
    syncStateFromSessionManager(ctx.sessionManager);
  });

  pi.on("tool_call", async (_event, ctx) => {
    syncStateFromSessionManager(ctx.sessionManager);
  });

  registerAllTools(pi);
}
