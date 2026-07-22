import type {
  DirectionPacket,
  RenderDirectionPacket,
  SuggestedAction,
} from "../../engine/render/packet-schema.ts";

export interface RenderedProseDeliveryInput {
  text: string;
  lintRuleIds: readonly string[];
}

type ProseDeliveryDetails =
  | { kind: "direct-reply"; toolCallId: string }
  | { kind: "render-fallback"; toolCallId: string }
  | {
      kind: "rendered";
      toolCallId: string;
      lintRuleIds: readonly string[];
      suggestedActions: readonly SuggestedAction[];
    };

export interface PendingProseDelivery {
  text: string;
  details: ProseDeliveryDetails;
}

export interface SettledProseDelivery {
  queue(delivery: PendingProseDelivery): void;
  settle(deliver: (delivery: PendingProseDelivery) => void): void;
}

export function createProseDelivery(
  packet: DirectionPacket,
  toolCallId: string,
  rendered?: RenderedProseDeliveryInput,
): PendingProseDelivery {
  if (!packet.needsRender) {
    return {
      text: packet.directReply,
      details: { kind: "direct-reply", toolCallId },
    };
  }
  if (rendered === undefined) {
    return {
      text: buildFallbackProse(packet),
      details: { kind: "render-fallback", toolCallId },
    };
  }
  return {
    text: rendered.text,
    details: {
      kind: "rendered",
      toolCallId,
      lintRuleIds: rendered.lintRuleIds,
      suggestedActions: packet.suggestedActions ?? [],
    },
  };
}

export function createSettledProseDelivery(): SettledProseDelivery {
  let pending: PendingProseDelivery[] = [];

  return {
    queue(delivery): void {
      pending.push(delivery);
    },
    settle(deliver): void {
      const deliveries = pending;
      pending = [];
      for (const delivery of deliveries) {
        deliver(delivery);
      }
    },
  };
}

function buildFallbackProse(packet: RenderDirectionPacket): string {
  return [
    "（渲染器暂不可用，以下为本轮结算摘要）",
    "",
    ...packet.resolvedChanges.map((entry) => `- ${entry}`),
    "",
    `> ${packet.endWindow}`,
  ].join("\n");
}
