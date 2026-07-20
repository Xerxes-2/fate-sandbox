import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isRecord } from "../core/utils/typebox-validation.ts";

const DEBUG_DIR = join("runtime", "debug");
const TRACE_DISABLED_ENV_VALUE = "0";

/** 简化的渲染消息形态（Pass-B 用 {role,text}，见 render-turn.ts RendererMessage）。 */
export interface TraceMessage {
  role: string;
  text: string;
}

/**
 * API 输入追踪默认开启，把当前轮次每次 LLM 调用导出到 runtime/debug/passA-N.md
 * （结算）和 passB-N.md（首写 / lint 重写 / reroll / digest）。设置 FATE_DEBUG_API=0
 * 可关闭；测试环境始终禁用，避免测试运行写入 runtime。
 */
export function isApiTraceEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return (
    environment["NODE_TEST_CONTEXT"] === undefined &&
    environment["FATE_DEBUG_API"]?.trim() !== TRACE_DISABLED_ENV_VALUE
  );
}

let passACounter = 0;
let passBCounter = 0;

/** 每个玩家回合开始时清空上一轮快照、重置计数。 */
export function beginTurnTrace(turnLabel: string): void {
  if (!isApiTraceEnabled()) {
    return;
  }
  passACounter = 0;
  passBCounter = 0;
  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    // 只清本轮 LLM 输入快照（passA-*/passB-*）；compaction.md 是产物，跨轮（含 retry）保留。
    for (const file of readdirSync(DEBUG_DIR)) {
      if (/^pass[AB]-\d+\.md$/u.test(file)) {
        rmSync(join(DEBUG_DIR, file), { force: true });
      }
    }
    writeFileSync(join(DEBUG_DIR, "_turn.txt"), `${turnLabel}\n`);
  } catch {
    // debug 落盘失败不影响游戏流程。
  }
}

/** 结算 pass：每次 agent-loop LLM 调用前导出（passA-1, passA-2, …）。 */
export function dumpPassA(systemPrompt: string, messages: readonly unknown[]): void {
  if (!isApiTraceEnabled()) {
    return;
  }
  passACounter += 1;
  writeTrace(`passA-${passACounter}`, `结算 LLM 调用 #${passACounter}`, systemPrompt, messages);
}

/** 渲染 pass：每次渲染器调用导出（passB-1, passB-2, …），label 标注调用路径。 */
export function dumpPassB(
  systemPrompt: string,
  messages: readonly TraceMessage[],
  label: string,
): void {
  if (!isApiTraceEnabled()) {
    return;
  }
  passBCounter += 1;
  const normalized = messages.map((message) => ({
    role: message.role,
    content: [{ type: "text", text: message.text }],
  }));
  writeTrace(
    `passB-${passBCounter}`,
    `渲染 LLM 调用 #${passBCounter}（${label}）`,
    systemPrompt,
    normalized,
  );
}

/** 接管压缩产物导出（确定性结算索引）。 */
export function dumpCompaction(summary: string, meta: Record<string, unknown>): void {
  if (!isApiTraceEnabled()) {
    return;
  }
  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    const stamped = { capturedAt: new Date().toISOString(), ...meta };
    writeFileSync(
      join(DEBUG_DIR, "compaction.md"),
      `# 确定性压缩产物\n\n\`${JSON.stringify(stamped)}\`\n\n---\n\n${summary}\n`,
    );
  } catch {
    // debug 落盘失败不影响游戏流程。
  }
}

function writeTrace(
  name: string,
  title: string,
  systemPrompt: string,
  messages: readonly unknown[],
): void {
  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    writeFileSync(join(DEBUG_DIR, `${name}.md`), renderTranscript(title, systemPrompt, messages));
  } catch {
    // debug 落盘失败不影响游戏流程。
  }
}

/** 纯函数：把 system prompt + 消息序列渲染成可读 markdown transcript。 */
export function renderTranscript(
  title: string,
  systemPrompt: string,
  messages: readonly unknown[],
): string {
  const lines = [
    `# ${title}`,
    "",
    `消息数：${messages.length} · system 字符：${systemPrompt.length}`,
    "",
    "## SYSTEM",
    "```",
    systemPrompt,
    "```",
    "",
  ];
  messages.forEach((message, index) => {
    if (!isRecord(message)) {
      return;
    }
    const role = typeof message["role"] === "string" ? message["role"] : "?";
    lines.push(`## [${index + 1}] ${role}`, ...renderContent(message), "");
  });
  return lines.join("\n");
}

function renderContent(message: Record<string, unknown>): string[] {
  const out: string[] = [];
  const customType = message["customType"];
  if (typeof customType === "string") {
    out.push(`_customType: ${customType}_`);
  }
  const content = message["content"];
  if (typeof content === "string") {
    out.push(content);
    return out;
  }
  if (!Array.isArray(content)) {
    out.push("_(无 content)_");
    return out;
  }
  for (const part of content) {
    if (!isRecord(part)) {
      continue;
    }
    const type = part["type"];
    if (type === "text" && typeof part["text"] === "string") {
      out.push(part["text"]);
    } else if (type === "toolCall") {
      out.push(`→ tool: ${String(part["name"])}`, "```json", safeJson(part["arguments"]), "```");
    } else if (type === "thinking") {
      out.push("_[thinking]_");
    } else {
      out.push(`_[${String(type)}]_`);
    }
  }
  return out;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
