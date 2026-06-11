import { complete } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { syncStateFromSessionManager } from "../../engine/core/session-hydration.ts";
import { buildStateExclusionDigestFromRaw } from "../../engine/core/state-file-projection.ts";
import { exportState } from "../../engine/core/state-store.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const POLICY_PATH = join(PROJECT_ROOT, "agents", "compaction-policy.md");

const FALLBACK_SUMMARY_MAX_TOKENS = 8192;

/**
 * 洁净室摘要 system prompt：不带 GM 人格、不带创作指令，
 * 摘要器只看 policy 和待压缩对话，防止摘要被角色口吻污染。
 */
const SUMMARIZER_SYSTEM_PROMPT = [
  "You are a context summarization assistant for a Fate TRPG sandbox session.",
  "Read the conversation and produce a compaction summary that strictly follows the policy in the user message.",
  "Do NOT continue the conversation. Do NOT roleplay. ONLY output the summary.",
].join("\n");

export default function compactionPolicyExtension(pi: ExtensionAPI): void {
  pi.registerCommand("fate-compact", {
    description: "Compact chat memory with Fate sandbox state exclusion reference",
    // eslint-disable-next-line @typescript-eslint/require-await -- registerCommand requires a Promise-returning handler; ctx.compact is fire-and-forget
    handler: async (_args, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify("Fate compaction started", "info");
      }
      ctx.compact({
        // 仅在 session_before_compact 接管失败、回退到内置压缩时生效。
        customInstructions: buildFallbackInstructions(ctx),
        onComplete: () => {
          if (ctx.hasUI) {
            ctx.ui.notify("Fate compaction completed", "info");
          }
        },
        onError: (error) => {
          if (ctx.hasUI) {
            ctx.ui.notify(`Fate compaction failed: ${error.message}`, "error");
          }
        },
      });
    },
  });

  // 完全接管手动与自动压缩：内置 SUMMARIZATION_PROMPT（Goal/Progress/...
  // 编码任务模板）不再参与，policy 成为唯一指令。
  pi.on("session_before_compact", async (event, ctx) => {
    return await runFsnCompaction(event, ctx);
  });
}

async function runFsnCompaction(
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
): Promise<{ compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number } } | undefined> {
  const { preparation, signal } = event;
  const { messagesToSummarize, turnPrefixMessages, firstKeptEntryId, tokensBefore, previousSummary } = preparation;

  const model = ctx.model;
  if (model === undefined) {
    notify(ctx, "Fate compaction: no active model, falling back to built-in compaction", "warning");
    return undefined;
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || auth.apiKey === undefined) {
    notify(ctx, "Fate compaction: model auth unavailable, falling back to built-in compaction", "warning");
    return undefined;
  }

  const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
  if (allMessages.length === 0) {
    return undefined;
  }

  notify(
    ctx,
    `Fate compaction: summarizing ${allMessages.length} messages (${tokensBefore.toLocaleString()} tokens) with ${model.id}`,
    "info",
  );

  const promptText = buildSummarizerPrompt(ctx, previousSummary, serializeConversation(convertToLlm(allMessages)));

  try {
    const response = await complete(
      model,
      {
        systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: promptText }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        maxTokens: preparation.settings.reserveTokens > 0
          ? preparation.settings.reserveTokens
          : FALLBACK_SUMMARY_MAX_TOKENS,
        signal,
      },
    );

    const summary = response.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (summary === "") {
      if (!signal.aborted) {
        notify(ctx, "Fate compaction summary was empty, falling back to built-in compaction", "warning");
      }
      return undefined;
    }

    return { compaction: { summary, firstKeptEntryId, tokensBefore } };
  } catch (error) {
    if (!signal.aborted) {
      notify(ctx, `Fate compaction failed (${formatError(error)}), falling back to built-in compaction`, "warning");
    }
    return undefined;
  }
}

function buildSummarizerPrompt(
  ctx: ExtensionContext,
  previousSummary: string | undefined,
  conversationText: string,
): string {
  const sections = [
    readFileSync(POLICY_PATH, "utf-8").trim(),
    "",
    "<current_state_for_exclusion>",
    JSON.stringify(readStateExclusionDigest(ctx), null, 2),
    "</current_state_for_exclusion>",
  ];
  if (previousSummary !== undefined && previousSummary.trim() !== "") {
    sections.push(
      "",
      "<previous_compaction_summary_for_exclusion>",
      previousSummary.trim(),
      "</previous_compaction_summary_for_exclusion>",
    );
  }
  sections.push(
    "",
    "<conversation>",
    conversationText,
    "</conversation>",
    "",
    "Now produce the compaction summary following the policy above.",
  );
  return sections.join("\n");
}

/**
 * 回退路径（接管失败时内置压缩仍会运行）下的 customInstructions：
 * 内置 prompt 会把它当 "Additional focus" 附注，效果有限但好过没有。
 */
function buildFallbackInstructions(ctx: ExtensionContext): string {
  return [
    readFileSync(POLICY_PATH, "utf-8").trim(),
    "",
    "<current_state_for_exclusion>",
    JSON.stringify(readStateExclusionDigest(ctx), null, 2),
    "</current_state_for_exclusion>",
  ].join("\n");
}

/**
 * 从当前 session branch 同步进程内 canonical state 后直接取快照；
 * 不再读 state/state.json 侧通道，避免拿到别的 session/branch 的残留快照。
 */
function readStateExclusionDigest(
  ctx: ExtensionContext,
): ReturnType<typeof buildStateExclusionDigestFromRaw> | { error: string } {
  try {
    syncStateFromSessionManager(ctx.sessionManager);
    return buildStateExclusionDigestFromRaw(exportState());
  } catch (error) {
    return { error: formatError(error) };
  }
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (!existsSync(POLICY_PATH)) {
  throw new Error(`Missing compaction policy: ${POLICY_PATH}`);
}
