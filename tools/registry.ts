import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { FateToolDefinition, ToolResultRetention } from "./runtime/tool-definition.ts";

import { getStateSchemaToolDefinition } from "./debug/get-state-schema.ts";
import { migrateStateToolDefinition } from "./debug/migrate-state.ts";
import { overrideLockedFactToolDefinition } from "./debug/override-locked-fact.ts";
import { resetStateToolDefinition } from "./debug/reset-state.ts";
import { lookupToolDefinition } from "./lookup/lookup.ts";
import { renderDomainToolResult } from "./runtime/tool-render.ts";
import { commitTurnToolDefinition } from "./settlement/commit-turn.ts";
import { configureCampaignToolDefinition } from "./settlement/configure-campaign.ts";
import { getStatusToolDefinition } from "./settlement/get-status.ts";
import { harvestBackstageCandidateToolDefinition } from "./settlement/harvest-backstage-candidate.ts";
import { initializeNewGameToolDefinition } from "./settlement/initialize-new-game.ts";
import { manageFactionClockToolDefinition } from "./settlement/manage-faction-clock.ts";
import { patchStateToolDefinition } from "./settlement/patch-state.ts";
import { privateResolveToolDefinition } from "./settlement/private-resolve.ts";
import { recallMemoryToolDefinition } from "./settlement/recall-memory.ts";
import { recordActorKnowledgeToolDefinition } from "./settlement/record-actor-knowledge.ts";
import { recordMemoryToolDefinition } from "./settlement/record-memory.ts";
import { recordOffscreenEventToolDefinition } from "./settlement/record-offscreen-event.ts";
import { recordRelationshipSignalToolDefinition } from "./settlement/record-relationship-signal.ts";
import { resolveBackstageLineToolDefinition } from "./settlement/resolve-backstage-line.ts";
import { resolveCombatExchangeToolDefinition } from "./settlement/resolve-combat-exchange.ts";
import { retireActorToolDefinition } from "./settlement/retire-actor.ts";
import { revealSecretToolDefinition } from "./settlement/reveal-secret.ts";
import { runParallelLineToolDefinition } from "./settlement/run-parallel-line.ts";
import { runShowrunnerAuditToolDefinition } from "./settlement/run-showrunner-audit.ts";
import { setScenePresenceToolDefinition } from "./settlement/set-scene-presence.ts";
import { submitDirectionPacketToolDefinition } from "./settlement/submit-direction-packet.ts";
import { updateActorAgendaToolDefinition } from "./settlement/update-actor-agenda.ts";
import { updateActorConditionToolDefinition } from "./settlement/update-actor-condition.ts";
import { updateActorImpressionToolDefinition } from "./settlement/update-actor-impression.ts";
import { updateEconomyToolDefinition } from "./settlement/update-economy.ts";
import { updateHookToolDefinition } from "./settlement/update-hook.ts";
import { updateServantFormToolDefinition } from "./settlement/update-servant-form.ts";
import { upsertActorToolDefinition } from "./settlement/upsert-actor.ts";

/** 全部 Domain Event Tool 契约清单；契约本体与实现同文件维护。 */
const TOOL_DEFINITIONS: readonly FateToolDefinition[] = [
  initializeNewGameToolDefinition,
  configureCampaignToolDefinition,
  commitTurnToolDefinition,
  getStatusToolDefinition,
  recordMemoryToolDefinition,
  recordOffscreenEventToolDefinition,
  manageFactionClockToolDefinition,
  retireActorToolDefinition,
  updateActorAgendaToolDefinition,
  recordActorKnowledgeToolDefinition,
  recordRelationshipSignalToolDefinition,
  recallMemoryToolDefinition,
  updateActorImpressionToolDefinition,
  updateActorConditionToolDefinition,
  setScenePresenceToolDefinition,
  upsertActorToolDefinition,
  updateEconomyToolDefinition,
  updateServantFormToolDefinition,
  revealSecretToolDefinition,
  resolveCombatExchangeToolDefinition,
  runParallelLineToolDefinition,
  runShowrunnerAuditToolDefinition,
  harvestBackstageCandidateToolDefinition,
  resolveBackstageLineToolDefinition,
  privateResolveToolDefinition,
  submitDirectionPacketToolDefinition,
  updateHookToolDefinition,
  lookupToolDefinition,
  patchStateToolDefinition,
  overrideLockedFactToolDefinition,
  migrateStateToolDefinition,
  resetStateToolDefinition,
  getStateSchemaToolDefinition,
];

export function toolResultRetention(toolName: string): ToolResultRetention {
  return (
    TOOL_DEFINITIONS.find((definition) => definition.name === toolName)?.resultRetention ?? {
      kind: "current-player-turn",
    }
  );
}

export function registerAllTools(pi: ExtensionAPI): void {
  for (const definition of TOOL_DEFINITIONS) {
    const { resultRetention: _resultRetention, ...toolDefinition } = definition;
    pi.registerTool({
      label: "FSN 叙事",
      renderResult: renderDomainToolResult,
      ...toolDefinition,
    });
  }
}
