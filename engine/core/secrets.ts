import { recordMemory } from "./memory";
import { recordOffscreenEvent } from "./offscreen-event";
import {
  assertNonEmptyString,
  getState,
  type ActorId,
  type ActorSecretSlots,
  type NoblePhantasm,
  type OffscreenEvent,
  type SecretSlot,
  updateState,
} from "./state";

export type RevealSecretEvent =
  | { kind: "claim-reveal"; actorId: ActorId; claim: string; evidence: string }
  | { kind: "observed-reveal"; actorId: ActorId; trigger: string; evidence: string };

export type RevealSecretOutcome =
  | "revealed"
  | "foreshadowed"
  | "insufficient-evidence"
  | "incorrect";

export interface RevealSecretResult {
  outcome: RevealSecretOutcome;
  playerSafeMessage: string;
}

export function revealSecret(event: RevealSecretEvent): RevealSecretResult {
  const evidence = event.kind === "claim-reveal" ? event.evidence : event.evidence;
  assertNonEmptyString(evidence, "evidence");
  if (event.kind === "claim-reveal") {
    assertNonEmptyString(event.claim, "claim");
  } else {
    assertNonEmptyString(event.trigger, "trigger");
  }

  let result: RevealSecretResult = {
    outcome: "insufficient-evidence",
    playerSafeMessage: "证据不足，暂不能确认隐藏事实。",
  };

  updateState((draft) => {
    const actor = draft.public.actors[event.actorId];
    if (actor === undefined) {
      throw new Error(`actor 不存在: ${event.actorId}`);
    }
    const slots = draft.secrets.actorSecrets[event.actorId];
    if (slots === undefined) {
      result = { outcome: "insufficient-evidence", playerSafeMessage: "没有足够证据确认。" };
      return;
    }
    const trueName = slots.trueName;
    if (trueName !== undefined && canRevealStringSlot(event, trueName)) {
      trueName.revealState = "revealed";
      if (actor.servantForm !== null) {
        actor.servantForm.identity.trueName = { status: "revealed", display: trueName.value };
      }
      result = { outcome: "revealed", playerSafeMessage: "真名揭示已经成立。" };
      return;
    }
    const noblePhantasm = slots.hiddenNoblePhantasms.find((slot) =>
      canRevealNoblePhantasmSlot(event, slot),
    );
    if (noblePhantasm !== undefined && actor.servantForm !== null) {
      noblePhantasm.revealState = "revealed";
      actor.servantForm.noblePhantasms.push({ ...noblePhantasm.value, status: "revealed" });
      result = { outcome: "revealed", playerSafeMessage: "隐藏宝具信息已经揭示。" };
      return;
    }
    const foreshadowed = markForeshadowed(slots, evidence);
    if (foreshadowed) {
      result = { outcome: "foreshadowed", playerSafeMessage: "线索成立，但尚不足以完全揭示。" };
    }
  });

  if (result.outcome === "revealed") {
    recordMemory({
      kind: "record-major-event",
      title: "隐藏事实揭示",
      summary: result.playerSafeMessage,
      consequences: ["相关公开状态已更新。"],
    });
  }

  return result;
}

function canRevealStringSlot(event: RevealSecretEvent, slot: SecretSlot<string>): boolean {
  if (slot.revealState === "revealed") return false;
  const needle = event.kind === "claim-reveal" ? event.claim : event.trigger;
  return slotMatches(slot, needle) && evidenceMatches(slot, event.evidence);
}

function canRevealNoblePhantasmSlot(
  event: RevealSecretEvent,
  slot: SecretSlot<NoblePhantasm>,
): boolean {
  if (slot.revealState === "revealed") return false;
  const needle = event.kind === "claim-reveal" ? event.claim : event.trigger;
  return slotMatches(slot, needle) && evidenceMatches(slot, event.evidence);
}

function slotMatches<T>(slot: SecretSlot<T>, text: string): boolean {
  const normalized = text.toLowerCase();
  const serialized = JSON.stringify(slot.value).toLowerCase();
  return (
    serialized.includes(normalized) ||
    slot.revealConditions.some((condition) => normalized.includes(condition.toLowerCase()))
  );
}

function evidenceMatches<T>(slot: SecretSlot<T>, evidence: string): boolean {
  const normalized = evidence.toLowerCase();
  return slot.revealConditions.some((condition) => normalized.includes(condition.toLowerCase()));
}

function markForeshadowed(slots: ActorSecretSlots, evidence: string): boolean {
  let marked = false;
  const allStringSlots: Array<SecretSlot<string>> = [
    ...(slots.trueName === undefined ? [] : [slots.trueName]),
    ...slots.privateMotives,
    ...slots.unrevealedAffiliations,
  ];
  const allNoblePhantasmSlots: Array<SecretSlot<NoblePhantasm>> = [...slots.hiddenNoblePhantasms];
  for (const slot of allStringSlots) {
    if (slot.revealState === "hidden" && evidenceMatches(slot, evidence)) {
      slot.revealState = "foreshadowed";
      marked = true;
    }
  }
  for (const slot of allNoblePhantasmSlots) {
    if (slot.revealState === "hidden" && evidenceMatches(slot, evidence)) {
      slot.revealState = "foreshadowed";
      marked = true;
    }
  }
  return marked;
}

export type PrivateResolveEvent =
  | { kind: "hidden-reaction"; actorId: ActorId; stimulus: string; publicContext: string }
  | { kind: "secret-compatibility"; actorId: ActorId; targetActorId: ActorId; interaction: string };

export interface PrivateResolveResult {
  outcome: "no-special-effect" | "subtle-reaction" | "strong-reaction" | "dangerous-escalation";
  narrativeConstraints: string[];
}

export function privateResolve(event: PrivateResolveEvent): PrivateResolveResult {
  return event.kind === "hidden-reaction" ? hiddenReaction(event) : secretCompatibility(event);
}

export function getOffscreenEventsForDebug(): readonly OffscreenEvent[] {
  return getState().secrets.offscreenEventLog;
}

function hiddenReaction(
  event: Extract<PrivateResolveEvent, { kind: "hidden-reaction" }>,
): PrivateResolveResult {
  assertNonEmptyString(event.stimulus, "stimulus");
  assertNonEmptyString(event.publicContext, "publicContext");
  let hasRelevantSecret = false;
  updateState((draft) => {
    if (draft.public.actors[event.actorId] === undefined) {
      throw new Error(`actor 不存在: ${event.actorId}`);
    }
    const slots = draft.secrets.actorSecrets[event.actorId];
    hasRelevantSecret =
      slots !== undefined && secretText(slots).includes(event.stimulus.toLowerCase());
    if (hasRelevantSecret) {
      recordOffscreenEvent({
        lineId: "private-resolve",
        actorIds: [event.actorId],
        timeRange: { start: draft.public.clock.currentAt, end: draft.public.clock.currentAt },
        visibility: "secret",
        summary: `隐藏反应触发：${event.publicContext}`,
        consequences: [],
        futureHooks: [],
        createdFrom: "gm",
      });
    }
  });
  return {
    outcome: hasRelevantSecret ? "subtle-reaction" : "no-special-effect",
    narrativeConstraints: hasRelevantSecret
      ? ["可以描写可见的细微反应，但不得泄露隐藏真相。"]
      : ["没有特殊隐藏反应；不要暗示不存在的秘密。"],
  };
}

function secretCompatibility(
  event: Extract<PrivateResolveEvent, { kind: "secret-compatibility" }>,
): PrivateResolveResult {
  assertNonEmptyString(event.interaction, "interaction");
  let bothHaveSecrets = false;
  updateState((draft) => {
    if (draft.public.actors[event.actorId] === undefined) {
      throw new Error(`actor 不存在: ${event.actorId}`);
    }
    if (draft.public.actors[event.targetActorId] === undefined) {
      throw new Error(`target actor 不存在: ${event.targetActorId}`);
    }
    bothHaveSecrets =
      draft.secrets.actorSecrets[event.actorId] !== undefined &&
      draft.secrets.actorSecrets[event.targetActorId] !== undefined;
  });
  return {
    outcome: bothHaveSecrets ? "strong-reaction" : "no-special-effect",
    narrativeConstraints: bothHaveSecrets
      ? ["互动存在隐藏相性；只输出玩家可见约束，不解释幕后原因。"]
      : ["没有隐藏相性介入。"],
  };
}

function secretText(slots: ActorSecretSlots): string {
  return JSON.stringify(slots).toLowerCase();
}
