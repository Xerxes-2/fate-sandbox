import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGmBrief } from "../core/gm-brief";
import { getPublicState } from "../core/state";
import {
  loadPromptPreset,
  type PromptPreset,
  type PromptPresetModule,
  type PromptSlot,
} from "./preset";

export interface TextMessage {
  role: "user";
  content: Array<{ type: "text"; text: string }>;
  timestamp: number;
}

export interface PromptAssets {
  system: string;
  preset: PromptPreset;
}

interface UserProfile {
  text: string;
}

interface PromptModule {
  id: string;
  slot: PromptSlot;
  priority: number;
  header: string;
  body: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

let cachedAssets: PromptAssets | null = null;
let cachedUserProfile: UserProfile | null = null;
const cachedFileSources = new Map<string, string>();

export function loadPromptAssets(): PromptAssets {
  if (cachedAssets === null) {
    cachedAssets = {
      system: readFileSync(join(PROJECT_ROOT, "agents", "gm-system.md"), "utf-8"),
      preset: loadPromptPreset(PROJECT_ROOT),
    };
  }
  return cachedAssets;
}

export function buildSystemPrompt(baseSystemPrompt: string): string {
  return baseSystemPrompt + "\n" + loadPromptAssets().system;
}

export function injectGmPromptMessages<TMessage>(
  messages: ReadonlyArray<TMessage>,
): Array<TMessage | TextMessage> {
  if (!hasUserMessage(messages)) {
    return [...messages];
  }

  return [
    ...buildSlotMessages("pre-history"),
    ...messages,
    ...buildSlotMessages("pre-response"),
    ...buildSlotMessages("final-contract"),
  ];
}

function buildPromptModules(): PromptModule[] {
  return loadPromptAssets()
    .preset.modules.filter((module) => module.enabled)
    .map(resolvePromptModule)
    .filter((module) => module.body.length > 0);
}

function resolvePromptModule(module: PromptPresetModule): PromptModule {
  return {
    id: module.id,
    slot: module.slot,
    priority: module.priority,
    header: module.header,
    body: resolvePromptModuleBody(module),
  };
}

function resolvePromptModuleBody(module: PromptPresetModule): string {
  if (module.source.kind === "file") {
    return readPromptFile(module.source.path);
  }
  if (module.source.name === "player-character") {
    return loadUserProfile().text;
  }
  return buildStatePressureText();
}

function readPromptFile(path: string): string {
  const cached = cachedFileSources.get(path);
  if (cached !== undefined) {
    return cached;
  }
  const content = readFileSync(join(PROJECT_ROOT, path), "utf-8");
  cachedFileSources.set(path, content);
  return content;
}

function buildSlotMessages(slot: PromptSlot): TextMessage[] {
  return buildPromptModules()
    .filter((module) => module.slot === slot)
    .toSorted(comparePromptModules)
    .map(buildPromptModuleMessage);
}

function comparePromptModules(left: PromptModule, right: PromptModule): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return left.id.localeCompare(right.id);
}

function buildPromptModuleMessage(module: PromptModule): TextMessage {
  return buildInjectedUserMessage(module.header, module.body);
}

function hasUserMessage(messages: ReadonlyArray<unknown>): boolean {
  return messages.some((message) => isMessageWithRole(message, "user"));
}

function buildInjectedUserMessage(header: string, body: string): TextMessage {
  return {
    role: "user",
    content: [{ type: "text", text: `<${header}>\n${body}\n</${header}>` }],
    timestamp: 0,
  };
}

function buildStatePressureText(): string {
  return [
    "当前机械状态简报由 public state 派生，只读参考，工具返回值优先。",
    "",
    buildGmBrief(getPublicState()),
    "",
    "这份简报只用于压住叙事倾向，不能替代工具调用；本轮任何工具返回值都覆盖简报。",
  ].join("\n");
}

function loadUserProfile(): UserProfile {
  if (cachedUserProfile === null) {
    cachedUserProfile = readUserProfile();
  }
  return cachedUserProfile;
}

function readUserProfile(): UserProfile {
  const path = join(PROJECT_ROOT, "data", "user.json");
  const raw = readFileSync(path, "utf-8");
  const parsed = parseJsonObject(raw, path);
  const name = parsed["姓名"];
  if (typeof name !== "string" || name.length === 0) {
    return { text: "" };
  }
  return { text: renderUserProfile(parsed) };
}

function renderUserProfile(profile: Record<string, unknown>): string {
  const lines = [
    renderProfileLine("姓名", profile["姓名"]),
    renderProfileLine("性别", profile["性别"]),
    renderProfileLine("年龄", profile["年龄"]),
    renderProfileLine("外貌", profile["外貌"]),
    renderProfileLine("身世背景", profile["身世背景"]),
    renderProfileLine("魔术回路", profile["魔术回路"]),
    renderProfileLine("特殊能力", profile["特殊能力"]),
    renderProfileLine("性格", profile["性格"]),
    renderProfileLine("目标", profile["目标"]),
    renderProfileLine("额外注记", profile["额外注记"]),
  ];
  return lines.filter((line) => line.length > 0).join("\n");
}

function renderProfileLine(label: string, value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? `${label}: ${trimmed}` : "";
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, nested]) => renderInlineValue(key, nested))
      .filter((entry) => entry.length > 0);
    return entries.length > 0 ? `${label}: ${entries.join("；")}` : "";
  }
  return "";
}

function renderInlineValue(label: string, value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? `${label}=${trimmed}` : "";
}

function parseJsonObject(raw: string, path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid JSON data ${path}: root must be an object.`);
  }
  return parsed;
}

function isMessageWithRole(message: unknown, role: string): boolean {
  if (!isRecord(message)) {
    return false;
  }
  return message["role"] === role;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
