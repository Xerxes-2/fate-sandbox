import type { SceneBeatThreatInput } from "../../engine/core/scene";
import type { ActorId, LocationState, SituationKind, StoryArcId, StoryBeatId } from "../../engine/core/state";
import type { TurnCommitInput } from "../../engine/core/turn-commit";

import { commitTurn } from "../../engine/core/turn-commit";
import { createId, getState, writeStateToDetails } from "../../engine/core/state";
import { persistCurrentState } from "../../engine/core/state-persistence";
import { textResult, type ToolResult } from "../runtime/tool-result";

interface SceneBeatWindowInput {
  currentArcId: StoryArcId;
  currentBeatId: StoryBeatId;
  title: string;
  allowedActions: string[];
  forbiddenEscalations: string[];
  completionCriteria: string[];
  nextBeatHints: string[];
}

interface StartSceneBeatInput {
  title: string;
  objectives: string[];
  purpose: string;
  arcId?: StoryArcId;
  beatId?: StoryBeatId;
  allowedActions?: string[];
  forbiddenEscalations?: string[];
  completionCriteria?: string[];
  nextBeatHints?: string[];
  threats?: SceneBeatThreatInput[];
  presentActorIds?: ActorId[];
  allyActorIds?: ActorId[];
  situation?: SituationKind;
  location?: LocationState;
  elapsedMinutes?: number;
}

const DEFAULT_ALLOWED_ACTIONS = ["观察当前局势", "回应在场角色", "决定下一步行动"];

export function startSceneBeatTool(params: unknown, sessionManager: unknown): ToolResult {
  const input = normalizeStartSceneBeatInput(params);
  const result = commitTurn(buildTurnCommitInput(input));
  persistCurrentState(sessionManager);
  const details: Record<string, unknown> = { result };
  writeStateToDetails(details);
  return textResult(result.message, details);
}

function buildTurnCommitInput(input: StartSceneBeatInput): TurnCommitInput {
  const state = getState();
  const currentWindow = state.public.scene.storyWindow;
  const storyWindow = {
    currentArcId: input.arcId ?? currentWindow?.currentArcId ?? "main",
    currentBeatId: input.beatId ?? createId("beat"),
    title: input.title,
    allowedActions: input.allowedActions ?? DEFAULT_ALLOWED_ACTIONS,
    forbiddenEscalations: input.forbiddenEscalations ?? [],
    completionCriteria: input.completionCriteria ?? input.objectives,
    nextBeatHints: input.nextBeatHints ?? [],
  };

  if (input.location !== undefined && input.elapsedMinutes === undefined && isCurrentLocation(input.location)) {
    return buildBeginBeatTurn(input, storyWindow);
  }

  if (input.location !== undefined || input.elapsedMinutes !== undefined) {
    if (input.location === undefined || input.elapsedMinutes === undefined) {
      throw new Error("start_scene_beat 同步移动时必须同时提供 location 和 elapsedMinutes；若只是当前地点开 beat，请不要重复传 location。");
    }
    return {
      summary: input.purpose,
      events: [
        {
          kind: "scene-beat",
          event: {
            kind: "move-location",
            input: {
              storyWindow,
              objectives: input.objectives,
              threats: input.threats,
              presentActorIds: input.presentActorIds,
              allyActorIds: input.allyActorIds,
              situation: input.situation,
              location: input.location,
              elapsedMinutes: input.elapsedMinutes,
              reason: input.purpose,
            },
          },
        },
      ],
    };
  }

  return buildBeginBeatTurn(input, storyWindow);
}

function buildBeginBeatTurn(input: StartSceneBeatInput, storyWindow: SceneBeatWindowInput): TurnCommitInput {
  return {
    summary: input.purpose,
    events: [
      {
        kind: "scene-beat",
        event: {
          kind: "begin-beat",
          input: {
            storyWindow,
            objectives: input.objectives,
            threats: input.threats,
            presentActorIds: input.presentActorIds,
            allyActorIds: input.allyActorIds,
            situation: input.situation,
            reason: input.purpose,
          },
        },
      },
    ],
  };
}

function isCurrentLocation(location: LocationState): boolean {
  const current = getState().public.scene.location;
  return (
    current.region === location.region &&
    current.site === location.site &&
    current.detail === location.detail &&
    current.boundary === location.boundary
  );
}

function normalizeStartSceneBeatInput(params: unknown): StartSceneBeatInput {
  const input = assertRecord(params, "start_scene_beat 参数");
  return {
    title: assertNonEmptyString(input["title"], "title"),
    objectives: normalizeStringArray(input["objectives"], "objectives"),
    purpose: assertNonEmptyString(input["purpose"], "purpose"),
    arcId: normalizeOptionalString(input["arcId"], "arcId"),
    beatId: normalizeOptionalString(input["beatId"], "beatId"),
    allowedActions: normalizeOptionalStringArray(input["allowedActions"], "allowedActions"),
    forbiddenEscalations: normalizeOptionalStringArray(
      input["forbiddenEscalations"],
      "forbiddenEscalations",
    ),
    completionCriteria: normalizeOptionalStringArray(input["completionCriteria"], "completionCriteria"),
    nextBeatHints: normalizeOptionalStringArray(input["nextBeatHints"], "nextBeatHints"),
    threats: normalizeOptionalThreats(input["threats"]),
    presentActorIds: normalizeOptionalStringArray(input["presentActorIds"], "presentActorIds"),
    allyActorIds: normalizeOptionalStringArray(input["allyActorIds"], "allyActorIds"),
    situation: normalizeOptionalString(input["situation"], "situation") as SituationKind | undefined,
    location: normalizeOptionalLocation(input["location"]),
    elapsedMinutes: normalizeOptionalPositiveInteger(input["elapsedMinutes"], "elapsedMinutes"),
  };
}

function normalizeOptionalThreats(value: unknown): SceneBeatThreatInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertArray(value, "threats").map((entry) => {
    const threat = assertRecord(entry, "threats[]");
    return {
      summary: assertNonEmptyString(threat["summary"], "threat.summary"),
      severity: assertNonEmptyString(threat["severity"], "threat.severity") as SceneBeatThreatInput["severity"],
    };
  });
}

function normalizeOptionalLocation(value: unknown): LocationState | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = assertRecord(value, "location");
  return {
    region: assertNonEmptyString(input["region"], "location.region"),
    site: assertNonEmptyString(input["site"], "location.site"),
    detail: assertNonEmptyString(input["detail"], "location.detail"),
    boundary: assertNonEmptyString(input["boundary"], "location.boundary") as LocationState["boundary"],
  };
}

function normalizeOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeStringArray(value, fieldName);
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  return assertArray(value, fieldName).map((entry) => assertNonEmptyString(entry, `${fieldName}[]`));
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertNonEmptyString(value, fieldName);
}

function normalizeOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`非法${fieldName}: 必须是大于 0 的整数。`);
  }
  return parsed;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`非法${fieldName}: 必须是非空字符串。`);
  }
  return value.trim();
}

function assertArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是数组。`);
  }
  return value;
}

function assertRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} 必须是对象。`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
