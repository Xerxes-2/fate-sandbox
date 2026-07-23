/**
 * 结算侧确定性截断摘要（替代 LLM compaction）。
 *
 * 领域模型兑现后，旧轮次对话里唯一不可再生的信息只剩「事件顺序索引」——
 * 持久事实全在 state（每轮全量注入），结算器的旧推理过程丢弃无损。
 * 所以 compaction 不再花钱请 LLM 总结：从每轮 submit_direction_packet
 * 的参数机械提取一行摘要，零成本、零漂移、字节稳定。
 */

import type { SessionTurn } from "../session-chronology/session-chronology.ts";
import type { RenderDirectionPacket } from "./packet-schema.ts";

/** 摘要条目（回合）总数上限（含上次摘要折叠进来的行）。 */
const MAX_DIGEST_LINES = 160;
const PLAYER_INPUT_EXCERPT_CHARS = 80;
const DIRECT_REPLY_EXCERPT_CHARS = 200;
/**
 * 两层梯度（回流自 lonestar settlement digest）：被压缩区域里最近若干轮在索引行下
 * 额外保留裁决细节（收尾窗口 / NPC 主动或静置 beat / 更长正文摘录）；更早回合只留一行。
 * 细节行不以 "- " 开头，所以再次 compaction 折叠时自动降级回单行索引。
 */
const RECENT_FULL_TURNS = 12;
const RECENT_PROSE_EXCERPT_CHARS = 200;
const END_WINDOW_EXCERPT_CHARS = 120;
const NPC_BEAT_EXCERPT_CHARS = 100;
const WORKING_SET_CAPSULE_HEADER = "[已结算剧情胶囊｜机械生成]";

const SUMMARY_HEADER = [
  "[结算上下文截断摘要｜机械生成]",
  "本摘要只是事件顺序索引。一切当前事实（角色、伤势、资源、悬念、义务、时钟）以注入的 state 为准，不要从本摘要推断状态。",
  "",
].join("\n");

/**
 * 从被压缩的消息里提取每轮一行的事件索引，并折叠上次摘要的旧行。
 * 完全确定性：同样的输入永远产出同样的摘要。
 */
export function buildSettlementCompactionSummary(
  turns: readonly SessionTurn[],
  previousSummary: string | undefined,
): string {
  const previousEntries: TurnDigestEntry[] = previousDigestLines(previousSummary).map((line) => ({
    header: line,
    details: [],
  }));
  const entries = [...previousEntries, ...turns.map(turnDigestEntry)];
  const kept = entries.slice(-MAX_DIGEST_LINES);
  const dropped = entries.length - kept.length;
  const sections = [SUMMARY_HEADER];
  if (dropped > 0) {
    sections.push(`（更早的 ${dropped} 轮索引已丢弃；如需历史事实查 state 的 turnLog/memory）`);
  }
  const fullFrom = Math.max(0, kept.length - RECENT_FULL_TURNS);
  kept.forEach((entry, index) => {
    sections.push(entry.header);
    if (index >= fullFrom) {
      sections.push(...entry.details);
    }
  });
  return sections.join("\n");
}

/**
 * Replace completed direction-packet calls with stable narrative capsules. Each capsule is derived
 * only from its completed turn; adding tool calls inside the current player turn cannot rewrite it.
 * The twelve-turn detail gradient matches compaction, so only the oldest rich capsule changes per turn.
 */
export function buildSettlementWorkingSetCapsules(
  turns: readonly SessionTurn[],
): ReadonlyMap<string, string> {
  const entries = turns.map(turnDigestEntry);
  const fullFrom = Math.max(0, entries.length - RECENT_FULL_TURNS);
  return new Map(
    entries.map((entry, index) => [
      entry.toolCallId,
      [
        WORKING_SET_CAPSULE_HEADER,
        entry.header,
        ...(index >= fullFrom ? entry.details.filter((line) => !line.includes("▸ 正文")) : []),
      ].join("\n"),
    ]),
  );
}

interface TurnDigestEntry {
  toolCallId?: string;
  /** 单行索引（"- " 开头，自洽）。 */
  header: string;
  /** 裁决细节行（仅最近 RECENT_FULL_TURNS 轮输出；非 "- " 开头，再压缩时自动降级）。 */
  details: string[];
}

function turnDigestEntry(turn: SessionTurn): TurnDigestEntry & { toolCallId: string } {
  const prose = turn.kind === "narrative" && turn.status === "delivered" ? turn.prose : undefined;
  return {
    toolCallId: turn.toolCallId,
    header: formatTurnLine(turn, prose),
    details: turn.kind === "narrative" ? formatTurnDetails(turn.packet, prose) : [],
  };
}

/** 近期轮的裁决细节：收尾窗口 + NPC 主动/静置 beat + 更长正文摘录。 */
function formatTurnDetails(packet: RenderDirectionPacket, prose: string | undefined): string[] {
  const details: string[] = [
    `  ⌛ 收尾窗口：${excerpt(packet.endWindow, END_WINDOW_EXCERPT_CHARS)}`,
  ];
  for (const stance of packet.npcStances) {
    details.push(`  ☰ ${stance.actorId}：${excerpt(stance.move, NPC_BEAT_EXCERPT_CHARS)}`);
  }
  for (const omission of packet.npcOmissions ?? []) {
    details.push(
      `  ◌ ${omission.actorId}（${omission.reasonCode}）：${excerpt(omission.playerSafeNote, NPC_BEAT_EXCERPT_CHARS)}`,
    );
  }
  if (prose !== undefined) {
    details.push(`  ▸ 正文（长摘）：${excerpt(prose, RECENT_PROSE_EXCERPT_CHARS)}`);
  }
  return details;
}

const PROSE_EXCERPT_CHARS = 60;

function formatTurnLine(turn: SessionTurn, prose: string | undefined): string {
  const input = excerpt(turn.playerInput, PLAYER_INPUT_EXCERPT_CHARS);
  if (turn.kind === "direct") {
    return `- 玩家「${input}」｜meta/OOC 轮，直答：${excerpt(turn.packet.directReply, DIRECT_REPLY_EXCERPT_CHARS)}`;
  }
  const changeText =
    turn.packet.resolvedChanges.length > 0 ? `→ ${turn.packet.resolvedChanges.join("；")}` : "";
  const proseText = prose === undefined ? "" : ` ▸ 正文：${excerpt(prose, PROSE_EXCERPT_CHARS)}`;
  return `- 玩家「${input}」｜${turn.packet.playerAction}${changeText}${proseText}`;
}

/** 上次摘要里的索引行（"- " 开头）原样折叠进来，保持跨多次 compaction 的连续性。 */
function previousDigestLines(previousSummary: string | undefined): string[] {
  if (previousSummary === undefined) return [];
  return previousSummary.split("\n").filter((line) => line.startsWith("- "));
}

function excerpt(text: string, maxChars: number): string {
  const collapsed = text.replaceAll(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed === "" ? "（无输入）" : collapsed;
  return `${collapsed.slice(0, maxChars)}…`;
}
