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

export interface SessionBranchEntry {
  type: string;
  id: string;
  parentId: string | null;
}

export type SessionChronologySource =
  | { kind: "messages"; messages: ReadonlyArray<unknown> }
  | { kind: "session-branch"; entries: ReadonlyArray<SessionBranchEntry> };

export type SessionChronologyProjectionKind = "render" | "settlement" | "reroll";
export type RendererMode = "opening" | "continuation";

export interface SessionChronologyAnomaly {
  kind:
    | "missing-packet-tool-call-id"
    | "duplicate-packet-tool-call-id"
    | "multiple-accepted-packets"
    | "invalid-direction-packet"
    | "duplicate-packet-result"
    | "packet-result-before-call"
    | "packet-result-crosses-turn-boundary"
    | "packet-result-tool-mismatch"
    | "orphan-packet-result"
    | "missing-delivery-tool-call-id"
    | "duplicate-delivery"
    | "orphan-delivery"
    | "delivery-kind-mismatch"
    | "delivery-before-packet-result"
    | "delivery-crosses-turn-boundary"
    | "invalid-delivery-kind"
    | "superseded-awaiting-delivery"
    | "malformed-session-entry";
  message: string;
  index: number;
  entryId?: string;
  parentId?: string | null;
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
  mode: RendererMode;
  turns: readonly DeliveredNarrativeTurn[];
  latestNarrativeProse?: string;
  awaitingDelivery?: AwaitingSessionTurn;
}

export interface SettlementChronologyView {
  turns: readonly SessionTurn[];
  latestNarrativeProse?: string;
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
  acceptedAt: number;
  playerBoundaryIndex: number;
  nextPlayerAt?: number;
  location?: SourceLocation;
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
  args: unknown;
}

interface StageResult<T> {
  value: T;
  anomalies: readonly SessionChronologyAnomaly[];
}

interface ResultOccurrence {
  index: number;
  isError: boolean;
  toolName?: string;
  location?: SourceLocation;
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
      return readProjection(
        buildSettlementView(chronology.turns, chronology.anomalies),
        chronology.anomalies,
        "settlement",
      );
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
  const adapted = adaptSource(source);
  const accepted = collectAcceptedPackets(adapted.value);
  const delivered = collectDeliveries(adapted.value, accepted.value);
  const turns = buildTurns(accepted.value, delivered.value);
  return {
    items: adapted.value,
    turns,
    deliveries: delivered.value,
    anomalies: [
      ...adapted.anomalies,
      ...accepted.anomalies,
      ...delivered.anomalies,
      ...supersededAwaitingAnomalies(turns, accepted.value),
    ],
  };
}

function adaptSource(source: SessionChronologySource): StageResult<SourceItem[]> {
  if (source.kind === "messages") {
    return {
      value: source.messages.map((message, index) => ({ index, message })),
      anomalies: [],
    };
  }
  const adapted = source.entries.map(adaptSessionEntry);
  return {
    value: adapted.map((result) => result.value),
    anomalies: adapted.flatMap((result) => result.anomalies),
  };
}

function adaptSessionEntry(entry: SessionBranchEntry, index: number): StageResult<SourceItem> {
  if (!isRecord(entry)) {
    return { value: { index }, anomalies: [malformedEntryAnomaly(index)] };
  }
  const location = sourceLocation(entry);
  const anomalies = location === undefined ? [malformedEntryAnomaly(index)] : [];
  if (entry["type"] === "message") {
    return {
      value: { index, message: entry["message"], ...(location === undefined ? {} : { location }) },
      anomalies,
    };
  }
  if (entry["type"] === "custom_message") {
    return {
      value: {
        index,
        message: {
          role: "custom",
          customType: entry["customType"],
          content: entry["content"],
          details: entry["details"],
        },
        ...(location === undefined ? {} : { location }),
      },
      anomalies,
    };
  }
  return { value: { index, ...(location === undefined ? {} : { location }) }, anomalies };
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

function collectAcceptedPackets(items: readonly SourceItem[]): StageResult<AcceptedPacket[]> {
  const resultsById = collectSuccessfulResultOccurrences(items);
  const seenIds = new Set<string>();
  const packets: AcceptedPacket[] = [];
  const anomalies: SessionChronologyAnomaly[] = [];
  let currentInputs: string[] = [];
  let playerBoundaryIndex = -1;

  for (const item of items) {
    if (isPlayerBoundary(item.message)) {
      const input = playerInputText(item.message);
      currentInputs = input === undefined ? [] : [input];
      playerBoundaryIndex = item.index;
    }
    for (const call of packetCalls(item.message)) {
      if (call.toolCallId !== undefined && seenIds.has(call.toolCallId)) {
        anomalies.push(packetAnomaly("duplicate-packet-tool-call-id", item, call.toolCallId));
        continue;
      }
      if (call.toolCallId !== undefined) {
        seenIds.add(call.toolCallId);
      }
      const parsed = acceptPacketCall(
        call,
        item,
        currentInputs,
        resultsById,
        playerBoundaryIndex,
        findNextPlayerIndex(items, item.index),
      );
      anomalies.push(...parsed.anomalies);
      if (parsed.value !== undefined) {
        packets.push(parsed.value);
        currentInputs = [];
      }
    }
  }
  anomalies.push(...multipleAcceptedPacketAnomalies(packets));
  anomalies.push(...orphanPacketResultAnomalies(resultsById, seenIds));
  return { value: packets, anomalies };
}

function findNextPlayerIndex(items: readonly SourceItem[], afterIndex: number): number | undefined {
  return items.find((item) => item.index > afterIndex && isPlayerBoundary(item.message))?.index;
}

function acceptPacketCall(
  call: PacketCall,
  item: SourceItem,
  currentInputs: readonly string[],
  resultsById: ReadonlyMap<string, readonly ResultOccurrence[]>,
  playerBoundaryIndex: number,
  nextPlayerAt: number | undefined,
): StageResult<AcceptedPacket | undefined> {
  if (call.toolCallId === undefined) {
    return { value: undefined, anomalies: [packetAnomaly("missing-packet-tool-call-id", item)] };
  }
  const acceptance = acceptedResult(
    call.toolCallId,
    item,
    resultsById.get(call.toolCallId) ?? [],
    nextPlayerAt,
  );
  if (acceptance.value === undefined) {
    return { value: undefined, anomalies: acceptance.anomalies };
  }
  const parsed = parseAcceptedPacket(call.toolCallId, call.args, item);
  if (parsed.value === undefined) {
    return { value: undefined, anomalies: [...acceptance.anomalies, ...parsed.anomalies] };
  }
  return {
    value: {
      toolCallId: call.toolCallId,
      packet: parsed.value,
      playerInput: currentInputs.join("\n\n") || "(No player input captured for this turn.)",
      index: item.index,
      acceptedAt: acceptance.value,
      playerBoundaryIndex,
      ...(nextPlayerAt === undefined ? {} : { nextPlayerAt }),
      ...(item.location === undefined ? {} : { location: item.location }),
    },
    anomalies: [...acceptance.anomalies, ...parsed.anomalies],
  };
}

function collectSuccessfulResultOccurrences(
  items: readonly SourceItem[],
): Map<string, ResultOccurrence[]> {
  const occurrences = new Map<string, ResultOccurrence[]>();
  for (const item of items) {
    if (!isRecord(item.message) || item.message["role"] !== "toolResult") {
      continue;
    }
    const toolCallId = item.message["toolCallId"];
    if (typeof toolCallId !== "string") {
      continue;
    }
    const occurrence: ResultOccurrence = {
      index: item.index,
      isError: item.message["isError"] === true,
      ...(typeof item.message["toolName"] === "string"
        ? { toolName: item.message["toolName"] }
        : {}),
      ...(item.location === undefined ? {} : { location: item.location }),
    };
    occurrences.set(toolCallId, [...(occurrences.get(toolCallId) ?? []), occurrence]);
  }
  return occurrences;
}

function acceptedResult(
  toolCallId: string,
  callItem: SourceItem,
  occurrences: readonly ResultOccurrence[],
  nextPlayerAt: number | undefined,
): StageResult<number | undefined> {
  const anomalies: SessionChronologyAnomaly[] = [];
  if (occurrences.length > 1) {
    anomalies.push(
      packetLifecycleAnomaly(
        "duplicate-packet-result",
        occurrenceItem(occurrences[1] ?? occurrences[0], callItem),
        toolCallId,
      ),
    );
  }
  const mismatched = occurrences.find(
    (occurrence) => occurrence.toolName !== SUBMIT_DIRECTION_PACKET_TOOL,
  );
  if (mismatched !== undefined) {
    anomalies.push(
      packetLifecycleAnomaly(
        "packet-result-tool-mismatch",
        occurrenceItem(mismatched, callItem),
        toolCallId,
      ),
    );
  }
  const beforeCall = occurrences.find((occurrence) => occurrence.index < callItem.index);
  if (beforeCall !== undefined) {
    anomalies.push(
      packetLifecycleAnomaly(
        "packet-result-before-call",
        occurrenceItem(beforeCall, callItem),
        toolCallId,
      ),
    );
  }
  const crossesTurn = occurrences.find(
    (occurrence) => nextPlayerAt !== undefined && occurrence.index > nextPlayerAt,
  );
  if (crossesTurn !== undefined) {
    anomalies.push(
      packetLifecycleAnomaly(
        "packet-result-crosses-turn-boundary",
        occurrenceItem(crossesTurn, callItem),
        toolCallId,
      ),
    );
  }
  const accepted = occurrences.find(
    (occurrence) =>
      occurrence.index > callItem.index &&
      (nextPlayerAt === undefined || occurrence.index < nextPlayerAt) &&
      occurrence.toolName === SUBMIT_DIRECTION_PACKET_TOOL &&
      !occurrence.isError,
  );
  return { value: accepted?.index, anomalies };
}

function occurrenceItem(
  occurrence: ResultOccurrence | undefined,
  fallback: SourceItem,
): SourceItem {
  if (occurrence === undefined) {
    return fallback;
  }
  return {
    index: occurrence.index,
    ...(occurrence.location === undefined ? {} : { location: occurrence.location }),
  };
}

function multipleAcceptedPacketAnomalies(
  packets: readonly AcceptedPacket[],
): SessionChronologyAnomaly[] {
  const firstByBoundary = new Map<number, AcceptedPacket>();
  const anomalies: SessionChronologyAnomaly[] = [];
  for (const packet of packets) {
    const first = firstByBoundary.get(packet.playerBoundaryIndex);
    if (first === undefined) {
      firstByBoundary.set(packet.playerBoundaryIndex, packet);
      continue;
    }
    anomalies.push(
      withLocation(
        {
          kind: "multiple-accepted-packets",
          message: `multiple accepted Direction Packets share one player turn: ${first.toolCallId}, ${packet.toolCallId}`,
          index: packet.index,
          toolCallId: packet.toolCallId,
          blocks: ["render", "settlement", "reroll"],
        },
        packet.location,
      ),
    );
  }
  return anomalies;
}

function orphanPacketResultAnomalies(
  resultsById: ReadonlyMap<string, readonly ResultOccurrence[]>,
  seenCallIds: ReadonlySet<string>,
): SessionChronologyAnomaly[] {
  const anomalies: SessionChronologyAnomaly[] = [];
  for (const [toolCallId, occurrences] of resultsById) {
    if (seenCallIds.has(toolCallId)) {
      continue;
    }
    for (const occurrence of occurrences) {
      if (occurrence.toolName === SUBMIT_DIRECTION_PACKET_TOOL) {
        anomalies.push(
          packetLifecycleAnomaly(
            "orphan-packet-result",
            occurrenceItem(occurrence, { index: occurrence.index }),
            toolCallId,
          ),
        );
      }
    }
  }
  return anomalies;
}

function parseAcceptedPacket(
  toolCallId: string,
  args: unknown,
  item: SourceItem,
): StageResult<DirectionPacket | undefined> {
  try {
    return {
      value: parseDirectionPacket(args, `Direction Packet ${toolCallId}`),
      anomalies: [],
    };
  } catch (error) {
    return {
      value: undefined,
      anomalies: [
        withLocation(
          {
            kind: "invalid-direction-packet",
            message: error instanceof Error ? error.message : String(error),
            index: item.index,
            toolCallId,
            blocks: ["render", "settlement", "reroll"],
          },
          item.location,
        ),
      ],
    };
  }
}

function collectDeliveries(
  items: readonly SourceItem[],
  packets: readonly AcceptedPacket[],
): StageResult<Delivery[]> {
  const packetById = new Map(packets.map((packet) => [packet.toolCallId, packet]));
  const seenIds = new Set<string>();
  const deliveries: Delivery[] = [];
  const anomalies: SessionChronologyAnomaly[] = [];
  for (const item of items) {
    const candidate = deliveryCandidate(item.message);
    if (candidate === undefined) {
      continue;
    }
    if (candidate.toolCallId !== undefined && seenIds.has(candidate.toolCallId)) {
      anomalies.push(deliveryAnomaly("duplicate-delivery", item, candidate.toolCallId));
      continue;
    }
    if (candidate.toolCallId !== undefined) {
      seenIds.add(candidate.toolCallId);
    }
    const associated = associateDelivery(candidate, item, packetById);
    anomalies.push(...associated.anomalies);
    if (associated.value !== undefined) {
      deliveries.push(associated.value);
    }
  }
  return { value: deliveries, anomalies };
}

function associateDelivery(
  candidate: DeliveryCandidate,
  item: SourceItem,
  packetById: ReadonlyMap<string, AcceptedPacket>,
): StageResult<Delivery | undefined> {
  if (candidate.toolCallId === undefined) {
    return {
      value: undefined,
      anomalies: [deliveryAnomaly("missing-delivery-tool-call-id", item)],
    };
  }
  if (candidate.kind === undefined) {
    return {
      value: undefined,
      anomalies: [deliveryAnomaly("invalid-delivery-kind", item, candidate.toolCallId)],
    };
  }
  const packet = packetById.get(candidate.toolCallId);
  if (packet === undefined) {
    return {
      value: undefined,
      anomalies: [deliveryAnomaly("orphan-delivery", item, candidate.toolCallId)],
    };
  }
  if (item.index < packet.acceptedAt) {
    return {
      value: undefined,
      anomalies: [
        deliveryLifecycleAnomaly("delivery-before-packet-result", item, candidate.toolCallId),
      ],
    };
  }
  if (packet.nextPlayerAt !== undefined && item.index > packet.nextPlayerAt) {
    return {
      value: undefined,
      anomalies: [
        deliveryLifecycleAnomaly("delivery-crosses-turn-boundary", item, candidate.toolCallId),
      ],
    };
  }
  const packetKind = packet.packet.needsRender ? "narrative" : "direct";
  if (candidate.kind !== packetKind) {
    return {
      value: undefined,
      anomalies: [deliveryAnomaly("delivery-kind-mismatch", item, candidate.toolCallId)],
    };
  }
  return {
    value: {
      toolCallId: candidate.toolCallId,
      kind: candidate.kind,
      text: candidate.text,
      index: item.index,
      ...(item.location === undefined ? {} : { location: item.location }),
    },
    anomalies: [],
  };
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

function buildSettlementView(
  turns: readonly SessionTurn[],
  anomalies: readonly SessionChronologyAnomaly[],
): SettlementChronologyView {
  const deliveryIsAmbiguous = anomalies.some((anomaly) => anomaly.blocks.includes("render"));
  const latestNarrativeProse = deliveryIsAmbiguous
    ? undefined
    : turns
        .filter(
          (turn): turn is DeliveredNarrativeTurn =>
            turn.kind === "narrative" && turn.status === "delivered",
        )
        .at(-1)?.prose;
  return {
    turns,
    ...(latestNarrativeProse === undefined ? {} : { latestNarrativeProse }),
  };
}

function buildRenderView(turns: readonly SessionTurn[]): RenderChronologyView {
  const narrativeTurns = turns.filter(
    (turn): turn is DeliveredNarrativeTurn =>
      turn.kind === "narrative" && turn.status === "delivered",
  );
  const latestTurn = turns.at(-1);
  const awaitingDelivery = latestTurn?.status === "awaiting-delivery" ? latestTurn : undefined;
  const latestNarrativeProse = narrativeTurns.at(-1)?.prose;
  return {
    mode: narrativeTurns.length === 0 ? "opening" : "continuation",
    turns: narrativeTurns,
    ...(latestNarrativeProse === undefined ? {} : { latestNarrativeProse }),
    ...(awaitingDelivery === undefined ? {} : { awaitingDelivery }),
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
    .find((item) => item.location !== undefined);
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
      part["name"] === SUBMIT_DIRECTION_PACKET_TOOL
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
  const rawDetails = message["details"];
  const details = isRecord(rawDetails) ? rawDetails : {};
  const kind = deliveryKind(details["kind"]);
  const toolCallId = details["toolCallId"];
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

function isPlayerBoundary(message: unknown): boolean {
  if (!isRecord(message) || message["role"] !== "user") {
    return false;
  }
  const text = messageText(message["content"]).trim();
  return text.length === 0 || !isInjectedPromptText(text);
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

function supersededAwaitingAnomalies(
  turns: readonly SessionTurn[],
  packets: readonly AcceptedPacket[],
): SessionChronologyAnomaly[] {
  return turns.slice(0, -1).flatMap((turn) => {
    if (turn.status !== "awaiting-delivery") {
      return [];
    }
    const packet = packets.find((entry) => entry.toolCallId === turn.toolCallId);
    return [
      withLocation(
        {
          kind: "superseded-awaiting-delivery" as const,
          message: `accepted Direction Packet was superseded before delivery: ${turn.toolCallId}`,
          index: packet?.index ?? 0,
          toolCallId: turn.toolCallId,
          blocks: [],
        },
        packet?.location,
      ),
    ];
  });
}

function malformedEntryAnomaly(index: number): SessionChronologyAnomaly {
  return {
    kind: "malformed-session-entry",
    message: "Session Log entry is missing id, parentId, or type",
    index,
    blocks: ["reroll"],
  };
}

function packetLifecycleAnomaly(
  kind:
    | "duplicate-packet-result"
    | "packet-result-before-call"
    | "packet-result-crosses-turn-boundary"
    | "packet-result-tool-mismatch"
    | "orphan-packet-result",
  item: SourceItem,
  toolCallId: string,
): SessionChronologyAnomaly {
  return withLocation(
    {
      kind,
      message: `Direction Packet lifecycle is invalid: ${toolCallId}`,
      index: item.index,
      toolCallId,
      blocks: ["render", "settlement", "reroll"],
    },
    item.location,
  );
}

function deliveryLifecycleAnomaly(
  kind: "delivery-before-packet-result" | "delivery-crosses-turn-boundary",
  item: SourceItem,
  toolCallId: string,
): SessionChronologyAnomaly {
  return withLocation(
    {
      kind,
      message: `Direction Packet delivery order is invalid: ${toolCallId}`,
      index: item.index,
      toolCallId,
      blocks: ["render", "reroll"],
    },
    item.location,
  );
}

function packetAnomaly(
  kind: "missing-packet-tool-call-id" | "duplicate-packet-tool-call-id",
  item: SourceItem,
  toolCallId?: string,
): SessionChronologyAnomaly {
  return withLocation(
    {
      kind,
      message:
        toolCallId === undefined
          ? "submit_direction_packet call is missing its toolCallId"
          : `submit_direction_packet toolCallId is duplicated: ${toolCallId}`,
      index: item.index,
      ...(toolCallId === undefined ? {} : { toolCallId }),
      blocks: ["render", "settlement", "reroll"],
    },
    item.location,
  );
}

function deliveryAnomaly(
  kind:
    | "missing-delivery-tool-call-id"
    | "duplicate-delivery"
    | "orphan-delivery"
    | "delivery-kind-mismatch"
    | "invalid-delivery-kind",
  item: SourceItem,
  toolCallId?: string,
): SessionChronologyAnomaly {
  return withLocation(
    {
      kind,
      message:
        toolCallId === undefined
          ? "fsn-prose delivery is missing its Direction Packet toolCallId"
          : `fsn-prose delivery cannot be associated safely: ${toolCallId}`,
      index: item.index,
      ...(toolCallId === undefined ? {} : { toolCallId }),
      blocks: ["render", "reroll"],
    },
    item.location,
  );
}

function withLocation(
  anomaly: SessionChronologyAnomaly,
  location: SourceLocation | undefined,
): SessionChronologyAnomaly {
  return location === undefined
    ? anomaly
    : { ...anomaly, entryId: location.entryId, parentId: location.parentId };
}
