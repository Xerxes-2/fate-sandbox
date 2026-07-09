/**
 * Showrunner audit prompt assembly (engine-owned — see ADR 0007).
 *
 * The persona travels as `--system-prompt`; THIS module builds the `-p` task:
 * the GM's TimelineShowrunnerInput JSON + the engine-embedded Showrunner
 * Projection. No tool-input-shape guessing: the engine is the only writer of
 * the prompt, so `<timeline_state_context>` injection cannot silently fail.
 */

import type { OpeningMode, TimelineId } from "../state/state-enum-schemas.ts";

import { buildTimelineStateContextBlock } from "./showrunner-context-block.ts";

export interface TimelineShowrunnerStoryWindow {
  title: string;
  completionCriteria: string[];
  forbiddenEscalations: string[];
  nextBeatHints: string[];
}

/** The audit input contract the GM fills per call (persona "Input contract"). */
export interface TimelineShowrunnerInput {
  timelineId: TimelineId;
  openingMode: OpeningMode;
  premise: string;
  activeRuleSetIds: string[];
  currentArc: string;
  currentBeat: string;
  storyWindow: TimelineShowrunnerStoryWindow | null;
  playerVisibleFacts: string[];
  recentBeats: string[];
  suspectedDrift: string[];
}

export function buildShowrunnerAuditPrompt(
  rawState: unknown,
  input: TimelineShowrunnerInput,
): string {
  return [
    "TimelineShowrunnerInput:",
    JSON.stringify(input, null, 2),
    "",
    buildTimelineStateContextBlock(rawState),
    "",
    "Audit now. Output exactly one bare TimelineShowrunnerOutput JSON object.",
  ].join("\n");
}
