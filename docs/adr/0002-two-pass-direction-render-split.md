# Separate settlement and rendering into two passes

## Decision

Each rendered narrative turn uses two model calls. The settlement pass runs the agent loop, calls tools, adjudicates rules, and submits a structured direction packet through `submit_direction_packet`. The render pass is a bare `stream()` call that converts the packet into player-visible prose. A `needsRender: false` direct or meta turn stops after settlement.

The packet is the only current-turn channel between the two passes. `scanDirectionPacket` compares packet text against the unrevealed true-name and hidden Noble Phantasm strings returned by `collectUnrevealedSecretStrings`; any match blocks the whole packet. The renderer receives the packet and its previous prose as `fsn-prose` custom messages, but it cannot inspect state or use tools. The settlement context filters those custom messages out so rendered prose does not feed back into adjudication.

## Evidence

Session audits found unrevealed true names leaking from the former single-pass path. In that design, one generation had to maintain tool discipline, reason over secret state, and write player-facing prose. Engine rejections could also surface in the player response.

The split lets settlement and rendering use different models through `FATE_RENDER_MODEL`. The settlement pass can retry rejected tool calls without exposing the failure to the player, and the audit script can lint settlement and rendered prose separately.

## Trade-offs

The design adds one model call to every rendered turn. It also depends on packet completeness: facts omitted from `resolvedChanges` cannot appear in the rendered scene. The packet contract therefore tells the settlement pass to include every visible change rather than letting the renderer inspect state.
