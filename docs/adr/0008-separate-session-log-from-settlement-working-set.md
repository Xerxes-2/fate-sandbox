# Separate the Session Log from the Settlement Working Set

## Decision

The Session Log and the Settlement Working Set serve different purposes. The Session Log preserves the session tree for audit, rewind, repair, and debugging. Pass A receives a derived Settlement Working Set containing only information needed to adjudicate the active player turn: current instructions and state projections, the active agent loop, explicit unresolved workflow handoffs, deterministic capsules of completed turns, and the latest rendered-prose continuity anchor.

Completed-turn thinking, ordinary tool results, and replay-only tool arguments do not belong in the Settlement Working Set. A completed `submit_direction_packet` becomes a deterministic Settlement Turn Capsule that preserves plot causality without retaining rendering instructions or the execution trace. Game State remains authoritative for facts with mechanical or continuity consequences; a capsule is context, not a second fact store.

The completed-history projection changes only when a new player message starts a turn. It remains byte-stable while the active agent loop grows, and the capsule detail gradient rewrites at most one prior capsule at each turn boundary, preserving as much prompt-cache prefix as possible. The lossless Session Log is never rewritten to achieve context reduction.

A cross-turn workflow may not survive merely because generic assistant history happens to be replayed. Its tool contract must declare an explicit bounded retention rule, or its handle and actionable state must live in a state-backed ledger. Canonical campaign facts must always use Game State rather than ToolResult retention.

## Considered options

- Replaying the complete active branch was rejected because execution traces dominate long-session context and expose stale instructions to Pass A.
- Destructively pruning the Session Log was rejected because it would weaken audit, rewind, and repair.
- LLM-generated rolling summaries were rejected as the primary mechanism because they are nondeterministic, can distort hidden or canonical facts, and rewrite cacheable prefixes. Deterministic capsules complement Game State instead.

## Consequences

Pass A cannot recover discarded execution detail from its own context. It must use current Game State, a domain query, or an explicit workflow handoff; operators may inspect the Session Log when debugging. Any new tool whose result must affect a later player turn must therefore define that lifetime deliberately. Capsule detail limits are tuning parameters and are not part of this decision.
