import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState } from "../state/state-store.ts";
import { TIMELINE_SHOWRUNNER_PERSONA } from "./showrunner-persona.ts";
import { buildShowrunnerAuditPrompt, type TimelineShowrunnerInput } from "./showrunner-prompt.ts";

const INPUT: TimelineShowrunnerInput = {
  timelineId: "fsn",
  openingMode: "selected",
  premise: "Fifth Holy Grail War, night one",
  activeRuleSetIds: ["fsn-grail-war"],
  currentArc: "opening",
  currentBeat: "church-visit",
  storyWindow: {
    title: "Leave the church without a Servant fight",
    completionCriteria: ["exit reached"],
    forbiddenEscalations: ["no direct Servant battle"],
    nextBeatHints: ["Rin contact window"],
  },
  playerVisibleFacts: ["Kotomine supervises the war"],
  recentBeats: ["arrived at church", "spoke with Kotomine"],
  suspectedDrift: ["mystery hook repetition"],
};

void test("audit prompt 内嵌 input JSON 与 Showrunner Projection，且不含 secrets 原文", () => {
  const prompt = buildShowrunnerAuditPrompt(createInitialState(), INPUT);
  assert.match(prompt, /^TimelineShowrunnerInput:\n/);
  assert.match(prompt, /"timelineId": "fsn"/);
  assert.match(prompt, /"suspectedDrift"/);
  // Showrunner Projection embedded by the engine — single writer, no shape guessing
  assert.match(prompt, /<timeline_state_context>/);
  assert.match(prompt, /<\/timeline_state_context>/);
  assert.match(prompt, /"currentAtUtc": "2004-01-30T07:00:00\.000Z"/);
  assert.match(prompt, /由引擎在调用瞬间注入/);
  // semi-privileged projection: digests yes, raw secret slots never
  assert.doesNotMatch(prompt, /actorSecrets|secretEventLog|campaignSecrets/);
  assert.match(prompt, /Output exactly one bare TimelineShowrunnerOutput JSON object\./);
});

void test("persona 收编后保留审计契约、剥离子代理框架痕迹", () => {
  assert.match(TIMELINE_SHOWRUNNER_PERSONA, /## Input contract/);
  assert.match(TIMELINE_SHOWRUNNER_PERSONA, /## Output contract/);
  assert.match(TIMELINE_SHOWRUNNER_PERSONA, /## Timeline profiles/);
  assert.match(TIMELINE_SHOWRUNNER_PERSONA, /## Audit process/);
  assert.match(TIMELINE_SHOWRUNNER_PERSONA, /hookLedger/);
  // pi-subagents framing must be gone (agent md is retired — ADR 0007)
  assert.doesNotMatch(TIMELINE_SHOWRUNNER_PERSONA, /agentScope/);
  assert.doesNotMatch(TIMELINE_SHOWRUNNER_PERSONA, /main GM process appends/);
});
