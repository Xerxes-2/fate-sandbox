/**
 * Fate/Stay Night 沙盒 — pi extension
 *
 * DeepSeek V4 特化：系统提示极简 + 上下文/铁则注入 user 消息流 + 全链路中文
 */

import type { ContextEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hydrateStateFromSessionEntries } from "./engine/core/session-hydration";
import { buildSystemPrompt, injectGmPromptMessages } from "./engine/gm-prompt/injection";
import { registerAllTools } from "./tools/registry";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function extension(pi: ExtensionAPI): void {
  pi.on("resources_discover", async () => {
    return { skillPaths: [join(__dirname, "skills")] };
  });

  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: buildSystemPrompt(event.systemPrompt) };
  });

  pi.on("context", async (event) => {
    return { messages: injectGmPromptMessages<ContextEvent["messages"][number]>(event.messages) };
  });

  pi.on("session_start", async (_event, ctx) => {
    hydrateStateFromSessionEntries(ctx.sessionManager.getBranch());
  });

  pi.on("session_tree", async (_event, ctx) => {
    hydrateStateFromSessionEntries(ctx.sessionManager.getBranch());
  });

  registerAllTools(pi);
}
