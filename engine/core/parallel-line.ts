import type {
  OffscreenEventSource,
  OffscreenEventVisibility,
  TimelineId,
} from "./state-enum-schemas.ts";

export type { OffscreenEventSource, OffscreenEventVisibility } from "./state-enum-schemas.ts";

export type ParallelLineOutcome = "no-change" | "progress" | "escalation" | "blocked";

export interface ParallelLineTimeWindow {
  start: string;
  end: string;
}

export interface ParallelLinePressureSlotHint {
  id: string;
  label: string;
  pressureType: string;
  actorOrFactionHints: string[];
  playerSafeProjectionKinds: string[];
  cooldownTurns: number;
  recentUses?: number;
  coolingDown?: boolean;
  forbiddenWhen: string[];
}

export interface ParallelLineInput {
  lineId: string;
  timelineId: TimelineId;
  genreContract: string;
  activePressurePalette: ParallelLinePressureSlotHint[];
  timeWindow: ParallelLineTimeWindow;
  currentArc: string;
  currentBeat: string;
  allowedScope: string[];
  forbiddenEscalations: string[];
  knownFacts: string[];
  privateFacts: string[];
  actorGoals: string[];
  previousLineState: string;
  playerSideSummary: string;
}

export interface ParallelLineOutput {
  lineId: string;
  actorIds: string[];
  timeRange: ParallelLineTimeWindow;
  outcome: ParallelLineOutcome;
  privateSummary: string;
  secretStateChanges: string[];
  publicLeakCandidates: string[];
  futureHooks: string[];
  riskFlags: string[];
  optionalNarrativeSnippet: string | null;
}

export interface OffscreenEvent {
  id: string;
  lineId: string;
  actorIds: string[];
  timeRange: ParallelLineTimeWindow;
  visibility: OffscreenEventVisibility;
  summary: string;
  consequences: string[];
  futureHooks: string[];
  createdFrom: OffscreenEventSource;
}
