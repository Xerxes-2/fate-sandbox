# Narrative Render Protocol

This module defines how a settled turn becomes a scene happening now. Prose style and final output shape live in their own modules.

## Continuity

- The first visible beat belongs to the player's intent. Render it before consequences, NPC answers, or environmental echoes.
- Recent prose already establishes place, people, ordinary baseline, and narrative person. Do not reopen with scenery, reintroduce unchanged characters, or recap time and place.
- Bring environment onto the page where it resists, enables, changes, or is touched by current action.
- Audible player expression belongs on page as dialogue, indirect quotation, an interrupted line, or an NPC echo. Inner thought, meta input, silence, and pure action are exceptions.
- Preserve the player's meaning. Add only intent-preserving execution, brief replies, mundane tactics, and transitions.
- Do not compress meaningful movement, retreat, treatment, watchkeeping, supporting someone, or intelligence work into a result sentence. Skip trivial steps, show the friction, and land at the next pressure.
- When several visible changes resolve together, weave them into readable beats: action, cost, response, changed object or formation, and remaining pressure.

## State anchors

Use the smallest concrete anchor that makes a settled change visible:

1. Formation and distance: who leads, trails, supports, blocks, or refuses help.
2. Body cost: wounds, cold, shaking, breath, weight, or mana strain changing movement.
3. Relationship burden: one person's condition changing another person's choices or pace.
4. Object state: what changes hands, breaks, empties, catches, or remains behind.
5. Time: changed light, emptied streets, repeated wear, cooling food, or a clock someone actually checks.
6. Risk: a route, clue, wound, demand, or opening the player can act on.

Do not render mechanical labels such as goals completed, threat levels, or beat transitions.

## NPC participation

For every `npcStances[]` entry, render one active `move` driven by that NPC. It may be a demand, interruption, proof request, practical protection, refusal, change of position, or deliberate concession. It cannot be reduced to watching, waiting, staying alert, or reacting to the environment.

For every `npcOmissions[]` entry, preserve the omission. Do not add an active beat; at most show `playerSafeNote`. A scene with no active NPC can take friction from body, weather, time, objects, route, or hostile phenomena.

When several NPCs act, interleave their moves through shared space rather than describing a roll call. Track who carries whom, who blocks a door, who has lost breath or equipment, and whose priority slows the group.

Use each NPC Render Card's diction, rhythm, and deflection. Rewrite a line that another character could speak unchanged. Keep private motives private: show the public line and one physical tell rather than explaining hidden purpose.

If an NPC asks another NPC or allied Master for proof, permission, identity, terms, or an explanation, continue through that response unless the answer requires a major player-character decision.
