export type ParallelLineOutcome = "no-change" | "progress" | "escalation" | "blocked";
export type OffscreenEventVisibility = "secret" | "foreshadowed" | "player-known";
export type OffscreenEventSource = "parallel-line-subagent" | "gm" | "debug";

export interface ParallelLineTimeWindow {
  start: string;
  end: string;
}

export interface ParallelLineInput {
  lineId: string;
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
