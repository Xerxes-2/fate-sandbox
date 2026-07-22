import type {
  DirectionPacket,
  DirectReplyPacket,
  RenderDirectionPacket,
} from "../render/packet-schema.ts";

import { isRecord } from "../core/utils/typebox-validation.ts";
import {
  formatSkillPlayerInput,
  parseSkillInvocation,
} from "../prompt-assembly/skill-invocation.ts";
import { parseDirectionPacket } from "../render/packet-schema.ts";

export const PROSE_CUSTOM_TYPE = "fsn-prose";
export const SUBMIT_DIRECTION_PACKET_TOOL = "submit_direction_packet";

export type SessionChronologySource =
  | { kind: "messages"; messages: ReadonlyArray<unknown> }
  | { kind: "session-branch"; entries: ReadonlyArray<unknown> };

export type SessionChronologyProjectionKind = "render" | "settlement" | "reroll";

export interface SessionChronologyAnomaly {
  kind:
    | "missing-packet-tool-call-id"
    | "duplicate-packet-tool-call-id"
    | "invalid-direction-packet"
    | "missing-delivery-tool-call-id"
    | "duplicate-delivery"
    | "orphan-delivery"
    | "delivery-kind-mismatch"
    | "invalid-delivery-kind";
  message: string;
  index: number;
  toolCallId?: string;
  blocks: readonly SessionChronologyProjectionKind[];
}

interface SessionTurnBase {
  toolCallId: string;
  playerInput: string;
}

export interface DeliveredNarrativeTurn extends SessionTurnBase {
  kind: "narrative";
  status: "delivered";
  packet: RenderDirectionPacket;
  prose: string;
}

export interface AwaitingNarrativeTurn extends SessionTurnBase {
  kind: "narrative";
  status: "awaiting-delivery";
  packet: RenderDirectionPacket;
}

export interface DeliveredDirectTurn extends SessionTurnBase {
  kind: "direct";
  status: "delivered";
  packet: DirectReplyPacket;
  reply: string;
}

export interface AwaitingDirectTurn extends SessionTurnBase {
  kind: "direct";
  status: "awaiting-delivery";
  packet: DirectReplyPacket;
}

export type SessionTurn =
  | DeliveredNarrativeTurn
  | AwaitingNarrativeTurn
  | DeliveredDirectTurn
  | AwaitingDirectTurn;

export type AwaitingSessionTurn = AwaitingNarrativeTurn | AwaitingDirectTurn;

export interface RenderChronologyView {
  mode: "opening" | "continuation";
  turns: readonly DeliveredNarrativeTurn[];
  latestNarrativeProse?: string;
  awaitingDelivery?: AwaitingSessionTurn;
}

export interface SettlementChronologyView {
  turns: readonly SessionTurn[];
}

export type RerollChronologyView =
  | { kind: "session-branch-required" }
  | { kind: "no-prose" }
  | { kind: "not-leaf"; proseEntryId: string; leafId: string }
  | { kind: "root-prose"; proseEntryId: string }
  | {
      kind: "ready";
      proseEntryId: string;
      parentId: string;
      toolCallId: string;
      packet: DirectionPacket;
      render: RenderChronologyView;
    };

export type SessionChronologyRead<T> =
  | { kind: "ready"; value: T; anomalies: readonly SessionChronologyAnomaly[] }
  | { kind: "blocked"; anomalies: readonly SessionChronologyAnomaly[] };

interface SourceLocation {
  entryId: string;
  parentId: string | null;
  entryType: string;
}

interface SourceItem {
  index: number;
  message?: unknown;
  location?: SourceLocation;
}

interface AcceptedPacket {
  toolCallId: string;
  packet: DirectionPacket;
  playerInput: string;
  index: number;
}

interface Delivery {
  toolCallId: string;
  kind: "narrative" | "direct";
  text: string;
  index: number;
  location?: SourceLocation;
}

interface FoldedChronology {
  items: readonly SourceItem[];
  turns: readonly SessionTurn[];
  deliveries: readonly Delivery[];
  anomalies: readonly SessionChronologyAnomaly[];
}

interface PacketCall {
  toolCallId?: string;
  args: Record<string, unknown>;
}

interface DeliveryCandidate {
  toolCallId?: string;
  kind?: "narrative" | "direct";
  text: string;
}

export function projectSessionChronology(
  source: SessionChronologySource,
  projection: { kind: "render" },
): SessionChronologyRead<RenderChronologyView>;
export function projectSessionChronology(
  source: SessionChronologySource,
  projection: { kind: "settlement" },
): SessionChronologyRead<SettlementChronologyView>;
export function projectSessionChronology(
  source: SessionChronologySource,
  projection: { kind: "reroll" },
): SessionChronologyRead<RerollChronologyView>;
export function projectSessionChronology(
  source: SessionChronologySource,
  projection: { kind: SessionChronologyProjectionKind },
): SessionChronologyRead<RenderChronologyView | SettlementChronologyView | RerollChronologyView> {
  const chronology = foldSessionChronology(source);
  switch (projection.kind) {
    case "render":
      return readProjection(buildRenderView(chronology.turns), chronology.anomalies, "render");
    case "settlement":
      return readProjection({ turns: chronology.turns }, chronology.anomalies, "settlement");
    case "reroll":
      return readProjection(buildRerollView(source, chronology), chronology.anomalies, "reroll");
  }
  throw new Error("Unsupported Session Chronology projection");
}

function readProjection<T>(
  value: T,
  anomalies: readonly SessionChronologyAnomaly[],
  projection: SessionChronologyProjectionKind,
): SessionChronologyRead<T> {
  if (anomalies.some((anomaly) => anomaly.blocks.includes(projection))) {
    return { kind: "blocked", anomalies };
  }
  return { kind: "ready", value, anomalies };
}

function foldSessionChronology(source: SessionChronologySource): FoldedChronology {
  const items = adaptSource(source);
  const anomalies: SessionChronologyAnomaly[] = [];
  const packets = collectAcceptedPackets(items, anomalies);
  const deliveries = collectDeliveries(items, packets, anomalies);
  return {
    items,
    turns: buildTurns(packets, deliveries),
    deliveries,
    anomalies,
  };
}

function adaptSource(source: SessionChronologySource): SourceItem[] {
  if (source.kind === "messages") {
    return source.messages.map((message, index) => ({ index, message }));
  }
  return source.entries.map((entry, index) => adaptSessionEntry(entry, index));
}

function adaptSessionEntry(entry: unknown, index: number): SourceItem {
  if (!isRecord(entry)) {
    return { index };
  }
  const location = sourceLocation(entry);
  if (entry["type"] === "message") {
    return { index, message: entry["message"], ...(location === undefined ? {} : { location }) };
  }
  if (entry["type"] === "custom_message") {
    return {
      index,
      message: {
        role: "custom",
        customType: entry["customType"],
        content: entry["content"],
        details: entry["details"],
      },
      ...(location === undefined ? {} : { location }),
    };
  }
  return { index, ...(location === undefined ? {} : { location }) };
}

function sourceLocation(entry: Record<string, unknown>): SourceLocation | undefined {
  const entryId = entry["id"];
  const parentId = entry["parentId"];
  const entryType = entry["type"];
  if (
    typeof entryId !== "string" ||
    (typeof parentId !== "string" && parentId !== null) ||
    typeof entryType !== "string"
  ) {
    return undefined;
  }
  return { entryId, parentId, entryType };
}

function collectAcceptedPackets(
  items: readonly SourceItem[],
  anomalies: SessionChronologyAnomaly[],
): AcceptedPacket[] {
  const acceptedIds = collectAcceptedToolCallIds(items);
  const seenIds = new Set<string>();
  const packets: AcceptedPacket[] = [];
  let currentInputs: string[] = [];

  for (const item of items) {
    const input = playerInputText(item.message);
    if (input !== undefined) {
      currentInputs.push(input);
    }
    for (const call of packetCalls(item.message)) {
      if (call.toolCallId === undefined) {
        anomalies.push(packetAnomaly("missing-packet-tool-call-id", item.index));
        continue;
      }
      if (!acceptedIds.has(call.toolCallId)) {
        continue;
      }
      if (seenIds.has(call.toolCallId)) {
        anomalies.push(packetAnomaly("duplicate-packet-tool-call-id", item.index, call.toolCallId));
        continue;
      }
      const packet = parseAcceptedPacket(call.toolCallId, call.args, item.index, anomalies);
      if (packet === undefined) {
        continue;
      }
      seenIds.add(call.toolCallId);
      packets.push({
        toolCallId: call.toolCallId,
        packet,
        playerInput: currentInputs.join("\n\n") || "(No player input captured for this turn.)",
        index: item.index,
      });
      currentInputs = [];
    }
  }
  return packets;
}

function collectAcceptedToolCallIds(items: readonly SourceItem[]): Set<string> {
  const accepted = new Set<string>();
  for (const item of items) {
    if (!isRecord(item.message) || item.message["role"] !== "toolResult") {
      continue;
    }
    const toolCallId = item.message["toolCallId"];
    if (typeof toolCallId === "string" && item.message["isError"] !== true) {
      accepted.add(toolCallId);
    }
  }
  return accepted;
}

function parseAcceptedPacket(
  toolCallId: string,
  args: Record<string, unknown>,
  index: number,
  anomalies: SessionChronologyAnomaly[],
): DirectionPacket | undefined {
  try {
    return parseDirectionPacket(args, `Direction Packet ${toolCallId}`);
  } catch (error) {
    anomalies.push({
      kind: "invalid-direction-packet",
      message: error instanceof Error ? error.message : String(error),
      index,
      toolCallId,
      blocks: ["render", "settlement", "reroll"],
    });
    return undefined;
  }
}

function collectDeliveries(
  items: readonly SourceItem[],
  packets: readonly AcceptedPacket[],
  anomalies: SessionChronologyAnomaly[],
): Delivery[] {
  const packetById = new Map(packets.map((packet) => [packet.toolCallId, packet]));
  const seenIds = new Set<string>();
  const deliveries: Delivery[] = [];
  for (const item of items) {
    const candidate = deliveryCandidate(item.message);
    if (candidate === undefined) {
      continue;
    }
    if (candidate.toolCallId === undefined) {
      anomalies.push(deliveryAnomaly("missing-delivery-tool-call-id", item.index));
      continue;
    }
    if (candidate.kind === undefined) {
      anomalies.push(deliveryAnomaly("invalid-delivery-kind", item.index, candidate.toolCallId));
      continue;
    }
    if (seenIds.has(candidate.toolCallId)) {
      anomalies.push(deliveryAnomaly("duplicate-delivery", item.index, candidate.toolCallId));
      continue;
    }
    seenIds.add(candidate.toolCallId);
    const packet = packetById.get(candidate.toolCallId);
    if (packet === undefined) {
      anomalies.push(deliveryAnomaly("orphan-delivery", item.index, candidate.toolCallId));
      continue;
    }
    const packetKind = packet.packet.needsRender ? "narrative" : "direct";
    if (candidate.kind !== packetKind) {
      anomalies.push(deliveryAnomaly("delivery-kind-mismatch", item.index, candidate.toolCallId));
      continue;
    }
    deliveries.push({
      toolCallId: candidate.toolCallId,
      kind: candidate.kind,
      text: candidate.text,
      index: item.index,
      ...(item.location === undefined ? {} : { location: item.location }),
    });
  }
  return deliveries;
}

function buildTurns(
  packets: readonly AcceptedPacket[],
  deliveries: readonly Delivery[],
): SessionTurn[] {
  const deliveryById = new Map(deliveries.map((delivery) => [delivery.toolCallId, delivery]));
  return packets.map((packet) => buildTurn(packet, deliveryById.get(packet.toolCallId)));
}

function buildTurn(packet: AcceptedPacket, delivery: Delivery | undefined): SessionTurn {
  const base = {
    toolCallId: packet.toolCallId,
    playerInput: packet.playerInput,
    packet: packet.packet,
  };
  if (packet.packet.needsRender) {
    return delivery === undefined
      ? { ...base, kind: "narrative", status: "awaiting-delivery", packet: packet.packet }
      : {
          ...base,
          kind: "narrative",
          status: "delivered",
          packet: packet.packet,
          prose: delivery.text,
        };
  }
  return delivery === undefined
    ? { ...base, kind: "direct", status: "awaiting-delivery", packet: packet.packet }
    : {
        ...base,
        kind: "direct",
        status: "delivered",
        packet: packet.packet,
        reply: delivery.text,
      };
}

function buildRenderView(turns: readonly SessionTurn[]): RenderChronologyView {
  const narrativeTurns = turns.filter(
    (turn): turn is DeliveredNarrativeTurn =>
      turn.kind === "narrative" && turn.status === "delivered",
  );
  const awaiting = turns.filter(
    (turn): turn is AwaitingSessionTurn => turn.status === "awaiting-delivery",
  );
  const latestNarrativeProse = narrativeTurns.at(-1)?.prose;
  return {
    mode: narrativeTurns.length === 0 ? "opening" : "continuation",
    turns: narrativeTurns,
    ...(latestNarrativeProse === undefined ? {} : { latestNarrativeProse }),
    ...(awaiting.length === 0 ? {} : { awaitingDelivery: awaiting.at(-1) }),
  };
}

function buildRerollView(
  source: SessionChronologySource,
  chronology: FoldedChronology,
): RerollChronologyView {
  if (source.kind !== "session-branch") {
    return { kind: "session-branch-required" };
  }
  const delivery = chronology.deliveries.at(-1);
  if (delivery?.location === undefined) {
    return { kind: "no-prose" };
  }
  const blockingItem = chronology.items
    .slice(delivery.index + 1)
    .find((item) => item.location?.entryType === "message");
  if (blockingItem?.location !== undefined) {
    return {
      kind: "not-leaf",
      proseEntryId: delivery.location.entryId,
      leafId: blockingItem.location.entryId,
    };
  }
  if (delivery.location.parentId === null) {
    return { kind: "root-prose", proseEntryId: delivery.location.entryId };
  }
  const turn = chronology.turns.find((candidate) => candidate.toolCallId === delivery.toolCallId);
  if (turn === undefined) {
    return { kind: "no-prose" };
  }
  const rerollTurns = chronology.turns.map((candidate) =>
    candidate.toolCallId === turn.toolCallId ? withoutDelivery(candidate) : candidate,
  );
  return {
    kind: "ready",
    proseEntryId: delivery.location.entryId,
    parentId: delivery.location.parentId,
    toolCallId: turn.toolCallId,
    packet: turn.packet,
    render: buildRenderView(rerollTurns),
  };
}

function withoutDelivery(turn: SessionTurn): SessionTurn {
  if (turn.kind === "narrative") {
    return {
      kind: "narrative",
      status: "awaiting-delivery",
      toolCallId: turn.toolCallId,
      playerInput: turn.playerInput,
      packet: turn.packet,
    };
  }
  return {
    kind: "direct",
    status: "awaiting-delivery",
    toolCallId: turn.toolCallId,
    playerInput: turn.playerInput,
    packet: turn.packet,
  };
}

function packetCalls(message: unknown): PacketCall[] {
  if (!isRecord(message) || message["role"] !== "assistant" || !Array.isArray(message["content"])) {
    return [];
  }
  const calls: PacketCall[] = [];
  for (const part of message["content"]) {
    if (
      isRecord(part) &&
      part["type"] === "toolCall" &&
      part["name"] === SUBMIT_DIRECTION_PACKET_TOOL &&
      isRecord(part["arguments"])
    ) {
      calls.push({
        ...(typeof part["id"] === "string" ? { toolCallId: part["id"] } : {}),
        args: part["arguments"],
      });
    }
  }
  return calls;
}

function deliveryCandidate(message: unknown): DeliveryCandidate | undefined {
  if (!isRecord(message) || message["customType"] !== PROSE_CUSTOM_TYPE) {
    return undefined;
  }
  const details = message["details"];
  const kind = isRecord(details) ? deliveryKind(details["kind"]) : undefined;
  const toolCallId = isRecord(details) ? details["toolCallId"] : undefined;
  return {
    ...(typeof toolCallId === "string" && toolCallId.length > 0 ? { toolCallId } : {}),
    ...(kind === undefined ? {} : { kind }),
    text: messageText(message["content"]),
  };
}

function deliveryKind(value: unknown): "narrative" | "direct" | undefined {
  if (value === "direct-reply") {
    return "direct";
  }
  if (value === "rendered" || value === "render-fallback" || value === "rerolled") {
    return "narrative";
  }
  return undefined;
}

function playerInputText(message: unknown): string | undefined {
  if (!isRecord(message) || message["role"] !== "user") {
    return undefined;
  }
  const text = messageText(message["content"]).trim();
  if (text.length === 0 || isInjectedPromptText(text)) {
    return undefined;
  }
  const invocation = parseSkillInvocation(text);
  return invocation === undefined ? text : formatSkillPlayerInput(invocation);
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        isRecord(part) && part["type"] === "text" && typeof part["text"] === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

const INJECTED_PROMPT_HEADERS = [
  "settlement_principles",
  "world_context",
  "input_guide",
  "social_guide",
  "tool_policy",
  "hard_rules",
  "story_driver",
  "mechanical_state",
  "prose_continuity",
  "direction_contract",
] as const;

function isInjectedPromptText(text: string): boolean {
  const match = /^<([a-z][a-z0-9_-]*)>\n[\s\S]*\n<\/\1>$/u.exec(text.trim());
  const header = match?.[1];
  return header !== undefined && INJECTED_PROMPT_HEADERS.some((value) => value === header);
}

function packetAnomaly(
  kind: "missing-packet-tool-call-id" | "duplicate-packet-tool-call-id",
  index: number,
  toolCallId?: string,
): SessionChronologyAnomaly {
  return {
    kind,
    message:
      toolCallId === undefined
        ? "submit_direction_packet call is missing its toolCallId"
        : `submit_direction_packet toolCallId is duplicated: ${toolCallId}`,
    index,
    ...(toolCallId === undefined ? {} : { toolCallId }),
    blocks: ["render", "settlement", "reroll"],
  };
}

function deliveryAnomaly(
  kind:
    | "missing-delivery-tool-call-id"
    | "duplicate-delivery"
    | "orphan-delivery"
    | "delivery-kind-mismatch"
    | "invalid-delivery-kind",
  index: number,
  toolCallId?: string,
): SessionChronologyAnomaly {
  return {
    kind,
    message:
      toolCallId === undefined
        ? "fsn-prose delivery is missing its Direction Packet toolCallId"
        : `fsn-prose delivery cannot be associated safely: ${toolCallId}`,
    index,
    ...(toolCallId === undefined ? {} : { toolCallId }),
    blocks: ["render", "reroll"],
  };
}
