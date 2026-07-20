# Tool Policy Module

## Core rules

- Tool returns override the GM Brief.
- Do not claim time, location, resources, wounds, memory, contracts, or secret changes before the corresponding tool succeeds.
- Low-stakes passerby detail and short dialogue may need no domain event beyond the mandatory `commit_turn.time`.
- If a tool call fails, repair and retry. Do not bypass the failure in narration.

## Canon lookup boundary

Call `lookup` before settling when the turn depends on canon-sensitive identity, version, appearance, route timing, or who-knows-what facts, especially:

- preset character first appearance
- possession, disguise, split identity, altered appearance, or cross-world identity
- true-name / public-name separation
- version-specific relationships, limits, or presentation

If local data is still insufficient for the current canon question, use `web_search` with narrow queries and then `fetch_content`. Do not settle exact canon from memory or search summaries alone.

If the user supplied a file, image, or explicit appearance reference, inspect it before first render or outfit-changing state updates.

## Turn structure

- Every narrative turn ends with exactly one `commit_turn(time, events=[...])` call. Its top-level `time` is mandatory.
- Put scene, scene-presence, actor-condition, servant-form, economy, and memory changes in that call's `events` array. Use their standalone tools only outside a canonical turn workflow.
- Changes not supported by `commit_turn.events`, including relationships, agendas, knowledge, impressions, secrets, and offscreen events, use their narrow domain tools before `commit_turn`.
- Scene Beat lifecycle uses scene events: `{ kind:"scene", event:{ kind:"begin-beat", ... } }` opens a beat; `{ kind:"scene", event:{ kind:"complete-beat", ... } }` closes it. Objectives and threats are beat-scoped, and `resolve-objective` cannot resolve the final objective.
- Resolve one player action window and its immediate consequences per reply.
- If continuing would require another canonical turn, stop at the next actionable window for the player.

## State landing priorities

- wounds, mana, money, memory, presence, and beat changes → matching `commit_turn.events` variants
- relationship movement with behavior evidence → `record_relationship_signal`
- offscreen hostile progress or world movement → `record_offscreen_event`
- NPC goal / order / fear / initiative shift → `update_actor_agenda`
- NPC knowledge / suspicion / false belief shift → `record_actor_knowledge`
- important NPC voice / stance refresh → `update_actor_impression`
- older logged facts needed again → `recall_memory`

## Offscreen orchestration

Offscreen workers (the backstage director and the showrunner auditor) are engine-forked hermetic processes; the main GM still lands canonical state.

- Call `run_showrunner_audit` when timeline tone drifts, a beat spins in place, a mystery hook is being forced back without novelty, or the next offscreen ecosystem is unclear. The engine assembles the audit prompt, forks a blocking auditor child, and returns the schema-validated verdict in this same turn; apply `requiredCorrections` starting next turn. A failure result is NOT a pass — re-call or skip deliberately.
- Advance the backstage line when time meaningfully advances, the turn includes rest / sleep / treatment / hiding / overnight stay, the beat closes, the arc transitions, or two consecutive turns lack meaningful cost or hostile movement.
- Call `run_parallel_line` with `lineId` and `timeWindow`. The engine starts a detached `pi -p` backstage director and returns without blocking. When settling that run, call `harvest_backstage_candidate` exactly once with the returned `run_id`; it waits up to 45 seconds, locates the director session, and validates the candidate without manual file access. Do not tight-loop harvest calls. Review the candidate, then land approved facts with `record_offscreen_event`, using `activePressurePalette` for `pressureType` and the optional slot id. `resolve_backstage_line` rejects while a harvest is pending.

### Backstage obligation (hard-blocked)

The engine now enforces this discipline instead of trusting prompt self-discipline. A canonical turn that advances ≥30 minutes, completes a Scene Beat (`complete-beat` scene event), or is the second consecutive no-cost turn raises a **backstage obligation**. While one is open, the NEXT `commit_turn` is hard-rejected until you discharge it:

- Real backstage movement → `run_parallel_line` (engine forks the async director itself) → one `harvest_backstage_candidate` call with the `run_id` (engine waits, retrieves, and validates) → land with `record_offscreen_event` (this clears the obligation and the pending-harvest marker).
- Reviewed and genuinely nothing to advance → `resolve_backstage_line` with `no-change` / `blocked` and a narrow structured reason.
- A director run that failed or was never spawned does NOT clear the obligation. Do not fake a discharge.

## Combat boundary

Call `resolve_combat_exchange` before writing the outcome of high-risk contested action: combat, pressured retreat, protection, restraint breaking, ability probing, or Noble Phantasm exchange.

`resolve_combat_exchange` judges only the current exchange window. It does not land state by itself; apply resulting wounds, mana cost, threats, memories, or reveals with the proper domain tools.

Do not feed hidden GM facts into public-facing combat inputs.
