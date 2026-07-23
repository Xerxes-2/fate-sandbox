import type { LintFinding } from "../audit/lint-rules.ts";
import type { RenderChronologyView } from "../session-chronology/session-chronology.ts";
import type { DirectionPacket, RenderDirectionPacket } from "./packet-schema.ts";

import {
  findSecretLeaks,
  lintFinalProse,
  lintProseLength,
  minimumProseUnits,
  proseLengthContextFromPacket,
} from "../audit/lint-rules.ts";

/**
 * 散文史分层窗口（缓存友好：高低水位滞回，边界只在跨过高水位时
 * 按步长跳动，绝大多数轮次历史前缀字节级不变，provider 前缀缓存可逐轮命中）。
 *
 * - 全文层：最近 FULL_LOW..FULL_HIGH 轮的完整正文，语感连续性载体。
 * - 摘要层：更早轮次每轮一行，从该轮 direction packet 提取（零 LLM 成本）。
 */
const FULL_TURNS_HIGH = 16;
const FULL_TURNS_LOW = 10;
/** 全文层字符预算；heavy 轮堆积时按步长提前把旧转降级进摘要层。 */
const FULL_LAYER_CHAR_BUDGET = 45_000;
const DIGEST_TURNS_HIGH = 32;
const DIGEST_TURNS_LOW = 16;

/** 渲染器输入消息：扩展层映射成 pi-ai 消息后走 stream()。 */
export interface RendererMessage {
  role: "user" | "assistant";
  text: string;
}

export interface RendererNameEntry {
  actorId: string;
  internalName: string;
  renderName: string;
}

interface RenderedTurn {
  /** 绝对轮号（1 起）；永不重编，保证摘要行字节稳定 */
  turn: number;
  playerInput: string;
  prose: string;
  digest: string;
}

/** writer 产出的高质量摘要，按 submit_direction_packet 的 toolCallId 索引。 */
export type ProseDigestOverrides = ReadonlyMap<string, string>;

/**
 * 装配渲染器（Pass B）输入：append-only 的多消息对话形。
 *
 * [user 摘要层?] + (user 玩家输入 / assistant 旧正文) \xd7 全文层
 * + user(本轮输入 + packet)。旧正文放 assistant 位：前缀逐轮可缓存，
 * 且模型把它们当「自己写的」，文风延续更自然。
 */
export function buildRendererMessages(
  chronology: RenderChronologyView,
  packet: DirectionPacket,
  digestOverrides?: ProseDigestOverrides,
  nameEntries: readonly RendererNameEntry[] = [],
  npcRenderCards?: string,
): RendererMessage[] {
  const turns: RenderedTurn[] = chronology.turns.map((turn, index) => {
    const turnNumber = index + 1;
    const writerDigest = digestOverrides?.get(turn.toolCallId);
    return {
      turn: turnNumber,
      playerInput: turn.playerInput,
      prose: turn.prose,
      digest:
        writerDigest === undefined
          ? buildTurnDigest(turnNumber, turn.packet)
          : `Turn ${turnNumber}: ${writerDigest}`,
    };
  });
  const fullStart = resolveFullLayerStart(turns);
  const digestStart = hysteresisStart(fullStart, DIGEST_TURNS_HIGH, DIGEST_TURNS_LOW);

  const result: RendererMessage[] = [];
  const digestTurns = turns.slice(digestStart, fullStart);
  if (digestTurns.length > 0) {
    result.push({
      role: "user",
      text: [
        "# Early Turn Digest (event continuity reference only)",
        "",
        ...digestTurns.map((turn) => turn.digest),
      ].join("\n"),
    });
  }
  for (const turn of turns.slice(fullStart)) {
    result.push({ role: "user", text: turn.playerInput });
    result.push({ role: "assistant", text: turn.prose });
  }

  const currentPlayerInput =
    chronology.awaitingDelivery?.playerInput ??
    "(No current player input was captured. Use packet.playerAction only.)";
  const isOpeningScene = chronology.mode === "opening";
  const finalSections: string[] = [];
  if (isOpeningScene) {
    finalSections.push(...buildOpeningSceneSection());
  }
  finalSections.push("# Current Player Input", "", currentPlayerInput, "");
  finalSections.push(...buildRendererNameSection(nameEntries));
  if (npcRenderCards !== undefined && npcRenderCards.length > 0) {
    finalSections.push(
      "# NPC Render Cards",
      "",
      "Use these player-safe cards to stage NPC posture, action texture, and dialogue voice. They do not authorize new facts or actions beyond the Direction Packet.",
      "",
      npcRenderCards,
      "",
    );
  }
  finalSections.push(
    "# Direction Packet",
    "",
    "```json",
    JSON.stringify(packet, null, 2),
    "```",
    "",
    ...buildLengthFloorSection(packet),
    "npcOmissions, when present, are binding: those present actors are deliberately静置 this turn. Do not give them an active beat; at most reflect the playerSafeNote surface. Never invent actions for them.",
    "suggestedActions, when present, are UI-only. Do not mention, number, summarize, or paraphrase them in prose; end on endWindow pressure instead.",
    isOpeningScene
      ? "Render the complete story opening under the Opening Scene contract. Treat # Current Player Input as premise and setup, not as dialogue to answer. Output only Chinese body prose."
      : "Continue directly from the latest body prose. First turn # Current Player Input into in-scene action or speech; do not preface it with renewed environment setup, character introduction, or a recap of the established situation. Then render consequences under the Direction Packet constraints. Output only Chinese body prose.",
  );
  result.push({ role: "user", text: finalSections.join("\n") });
  return result;
}

function buildOpeningSceneSection(): string[] {
  return [
    "# Render Mode",
    "",
    "Opening Scene — Story Beginning",
    "",
    "Follow the opening_protocol in the system prompt. Treat Current Player Input as premise and setup rather than dialogue to answer.",
    "",
  ];
}

function buildRendererNameSection(nameEntries: readonly RendererNameEntry[]): string[] {
  if (nameEntries.length === 0) {
    return [];
  }
  const hasHiddenInternal = nameEntries.some((entry) => entry.internalName !== entry.renderName);
  const lines = [
    "# Actor Render Names (binding)",
    "",
    "Use each renderName exactly for every appearance in Chinese prose. Never invent, vary, or re-transliterate these names into different Chinese homophones \u2014 reuse the spelling below verbatim each turn.",
  ];
  if (hasHiddenInternal) {
    lines.push(
      "When an entry also lists internalName, that label is an internal/binding identity (it may hold a not-yet-revealed true name) and must never appear in prose.",
    );
  }
  for (const entry of nameEntries) {
    lines.push(
      entry.internalName === entry.renderName
        ? `- ${entry.actorId}: renderName=${entry.renderName}`
        : `- ${entry.actorId}: internalName=${entry.internalName}; renderName=${entry.renderName}`,
    );
  }
  lines.push("");
  return lines;
}

function buildLengthFloorSection(packet: DirectionPacket): string[] {
  const context = proseLengthContextFromPacket(packet);
  if (context === undefined) {
    return [];
  }
  const minimum = minimumProseUnits(context);
  return [
    "# Render Length Floor (linted)",
    "",
    `Minimum readable units for this turn: ${minimum} 字.`,
    `Lint context: eventWeight=${context.eventWeight}; resolvedChanges=${context.resolvedChangeCount}; npcStances=${context.npcStanceCount}.`,
    "This floor is checked before and after the lint retry. Count CJK characters and Latin/number words; punctuation, headings, labels, XML, and Markdown do not help.",
    "Meet the floor by unfolding real process: player action, every resolvedChange, NPC reaction or silence, body cost, space or object change, and endWindow pressure. Do not pad, summarize, or repeat.",
    "",
  ];
}

function buildTurnDigest(turn: number, packet: RenderDirectionPacket): string {
  const changeText =
    packet.resolvedChanges.length > 0 ? `。${packet.resolvedChanges.join("，")}` : "";
  return `Turn ${turn}: ${packet.playerAction}${changeText}`;
}

/**
 * 滞回起点：total ≤ high 时全部保留；超出后边界按 step=high-low 对齐跳动，
 * 窗口在 (low, high] 间振荡，每 step 轮才作废一次前缀。
 */
function hysteresisStart(total: number, high: number, low: number): number {
  if (total <= high) return 0;
  const step = high - low;
  return Math.ceil((total - high) / step) * step;
}

/** 全文层起点：轮数滞回 + 字符预算（超预算时按同一步长继续前移）。 */
function resolveFullLayerStart(turns: readonly RenderedTurn[]): number {
  const step = FULL_TURNS_HIGH - FULL_TURNS_LOW;
  let start = hysteresisStart(turns.length, FULL_TURNS_HIGH, FULL_TURNS_LOW);
  while (
    turns.length - start > FULL_TURNS_LOW &&
    totalProseChars(turns, start) > FULL_LAYER_CHAR_BUDGET
  ) {
    start = Math.min(start + step, turns.length - FULL_TURNS_LOW);
  }
  return start;
}

function totalProseChars(turns: readonly RenderedTurn[], start: number): number {
  return turns.slice(start).reduce((chars, turn) => chars + turn.prose.length, 0);
}

export interface ProseLintReport {
  findings: LintFinding[];
  /** block 级（未揭示秘密泄漏）命中 */
  leaks: LintFinding[];
}

export function lintRenderedProse(
  prose: string,
  unrevealedSecrets: readonly string[],
  packet?: DirectionPacket,
): ProseLintReport {
  const leaks = findSecretLeaks(prose, unrevealedSecrets);
  const lengthContext = proseLengthContextFromPacket(packet);
  const lengthFindings = lengthContext === undefined ? [] : lintProseLength(prose, lengthContext);
  return { findings: [...lintFinalProse(prose), ...lengthFindings, ...leaks], leaks };
}

/** 终防线：重试后仍泄漏时遮蔽秘密字符串，保证正文可发而秘密不可读。 */
export function redactSecrets(prose: string, secrets: readonly string[]): string {
  let redacted = prose;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    redacted = redacted.replaceAll(secret, "▮".repeat(Math.min(secret.length, 4)));
  }
  return redacted;
}

/** 重试输入：原消息序列 + 首稿（assistant 位） + 违规清单；前缀与首次调用完全一致，缓存可复用。 */
export function buildLintRetryMessages(
  baseMessages: readonly RendererMessage[],
  firstProse: string,
  findings: readonly LintFinding[],
): RendererMessage[] {
  const rewriteInstruction = findings.some((finding) => finding.ruleId === "underlength-prose")
    ? "保持事件与对白语义不变，但补足必要过程与篇幅：把玩家行动、每条已结算变化、NPC 反应、空间或物件变化、结尾风险锚写到页面上。不要用空镜、复述、报告句或废话填字数。"
    : "保持事件、对白语义与篇幅不变。";
  return [
    ...baseMessages,
    { role: "assistant", text: firstProse },
    {
      role: "user",
      text: [
        "你刚才的产出违反了以下输出契约条目，请重写全文修正：",
        ...findings.map((finding) => `- [${finding.ruleId}] ${finding.match}`),
        "",
        rewriteInstruction,
        "只输出修正后的正文。",
      ].join("\n"),
    },
  ];
}
