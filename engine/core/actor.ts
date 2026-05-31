import type { ActorId, PublicActorState } from "./state";

import { assertNonEmptyString, updateState } from "./state";

export interface UpsertActorInput {
  actor: PublicActorState;
  present: boolean;
  ally: boolean;
  reason: string;
}

export interface UpsertActorResult {
  message: string;
}

export function upsertActor(input: UpsertActorInput): UpsertActorResult {
  assertNonEmptyString(input.reason, "reason");
  updateState((draft) => {
    const actor = input.actor;
    rejectPublicHiddenFacts(actor);
    draft.public.actors[actor.id] = actor;
    if (input.present) {
      draft.public.scene.presentActorIds = appendUniqueActorId(
        draft.public.scene.presentActorIds,
        actor.id,
      );
    }
    if (input.ally) {
      draft.public.allyActorIds = appendUniqueActorId(draft.public.allyActorIds, actor.id);
    }
  });
  return { message: `actor 已写入：${input.actor.id}。` };
}

function rejectPublicHiddenFacts(actor: PublicActorState): void {
  if (actor.id === "protagonist") return;
  const publicIdentityText = `${actor.identity.background}\n${actor.identity.lockedFacts
    .map((fact) => fact.text)
    .join("\n")}`;
  const hiddenFactMarkers = [
    "真名",
    "宝具",
    "幕后",
    "隐藏",
    "私密动机",
    "远坂樱",
    "刻印虫",
    "虚数",
    "Rider",
    "真正御主",
  ];
  const leakedMarkers = hiddenFactMarkers.filter((marker) => publicIdentityText.includes(marker));
  if (leakedMarkers.length > 0) {
    throw new Error(
      `upsert_actor 拒绝写入玩家未知幕后秘密: ${leakedMarkers.join(
        ", ",
      )}。public actor 只能写玩家当前可知事实；隐藏身份、真名、宝具、幕后御主权或私密动机必须留在 secrets/private_resolve/reveal_secret。`,
    );
  }
}

function appendUniqueActorId(ids: ActorId[], actorId: ActorId): ActorId[] {
  return ids.includes(actorId) ? ids : [...ids, actorId];
}
