# Direction Packet Contract

## Turn-ending flow

1. Finish domain settlement in state first.
2. Call `submit_direction_packet` exactly once.
3. Do not output narration outside tool calls.

## Packet language boundary

- Write packet fields in English or concise language-neutral scene facts.
- Do not prewrite Chinese prose in the packet.
- If a Chinese term matters for consistency, place it in `canonFacts`.

## Field writing rules

Fields marked `binding` must reach the rendered scene. Fields marked `free` are optional suggestions.

- `playerAction` (`binding`): the settled player intent as actively performed this turn. Preserve the core meaning while completing reasonable speech, movement, reactions, and minor tactics. Do not turn it into a new major decision, protected disclosure, or irreversible commitment.
- `resolvedChanges` (`binding`): every settled visible fact that landed this turn. Include time, wounds, mana, money, location, revelation, beat transition, combat verdict, relationship signal, and cost when relevant. Write what the player should see, hear, feel, or infer.
- `npcStances` (`player-safe`): one entry per present important NPC.
  - `stance` is the baseline tone, `wants` the standing desire, and `refusesToSay` the dodged topic, never the secret itself.
  - `move` (`binding`) is one concrete line, demand, or physical initiative that the NPC uses this turn to pursue `wants`. It must be the NPC's own initiative rather than a reaction to the player or environment. A `move` is required even during quiet transit.
  - `move` examples:
    - Bad: "reacts to the danger", "walks carefully to save mana", "watches the corridor". These are reactions or scenery.
    - Bad: "pretends to praise the blade while actually reassessing attack range". Keep the private reason in `wants` or `refusesToSay` instead of pre-explaining it for the renderer.
    - Good: "cuts in over the player to demand a two-minute halt before walking in blind", "tosses out that the steam ahead is thickening, without turning around". These are concrete initiatives the renderer can stage.
- `npcOmissions` (`binding`, optional): use this field when a present important NPC genuinely does not act this turn.
  - Each entry is `{ actorId, reasonCode, playerSafeNote }`.
  - `reasonCode` must be `offscreen`, `unconscious`, `physically-absent`, `watching-silently`, `blocked-by-threat`, or `not-relevant`.
  - `playerSafeNote` contains only the player-perceivable surface, such as "stands silent by the door", never the secret itself.
  - Every present important NPC must appear in either `npcStances` or `npcOmissions`, but not both. Each `actorId` must exist and be present in the current scene. Establish remote, phone, or dream presence with `set_scene_presence` first.
- `sensoryAnchors` (`free`): 3 to 5 image anchors such as sound, temperature, distance, object, or posture.
- `endWindow` (`binding`): the new actionable situation where the scene stops for the player character. Use pressure, opening, challenge, exposed clue, changed formation, route change, or a cost only the player can answer. Do not turn it into a menu.
- `eventWeight`: use `light` for pure transitions or simple confirmations, `normal` by default, and `heavy` for battles, major revelations, or relationship turns needing full process. This is a scene-completeness signal, not a word quota.
- `canonFacts`: only the canon facts the renderer needs this turn: appearance, voice, ability presentation, relationship boundary, or term mapping.
- `suggestedActions` (`free`, optional): 1 to 4 candidate player inputs for the `/choice` UI. Each `submitText` is submitted verbatim as a real player message, so write it as the player's own input text. Chinese is allowed here as the one exception to the packet language boundary. Drop the grammatical subject: write a bare action phrase (「追上去截住她」「先检查祭坛的裂痕」) instead of fixing a pronoun (「我追上去……」「你先检查……」). Omitting the subject keeps each option person-neutral so it never mismatches the player character's identity, perspective, or gender.
- Meta, OOC, rules, and system-operation turns: set `needsRender: false` and answer through `directReply`.
- Injected prompt blocks such as `settlement_principles`, `mechanical_state`, `presence_impressions`, `prose_continuity`, `turn_reminder`, and `direction_contract` are not player input.

## Quality floor

The packet is the renderer's only input. Missing settled changes disappear from the player's scene. Missing `npcStances` makes important NPCs inert. An `npcStances` entry whose `move` is vague, reactive, or environment-driven ("reacts to the danger", "walks carefully", "stays alert") also makes the NPC inert: write a concrete agenda-driven act the renderer can stage verbatim. A present important NPC who truly stays out of the action this turn goes in `npcOmissions`, not silently dropped; the tool rejects a packet that leaves one uncovered. Missing `canonFacts` makes the renderer guess canon.

The tool defines a "present important NPC" as an on-scene non-protagonist actor who has an impression card, appears in a relationship signal, is an ally, or has a secret agenda. Coverage is enforced for exactly that set.
