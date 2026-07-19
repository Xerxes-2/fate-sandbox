# Enforce GM obligations through engine ledgers

## Decision

Three classes of GM discipline live in state-backed ledgers rather than prompt instructions:

- `public.obligations` records required adjudications. Events such as `resolve_combat_exchange` register state changes that must land. Domain events settle them in FIFO order, and `commit_turn` or `progress_scene_beat` rejects the commit while any obligation remains open.
- `secrets.factionClocks` and `scheduledEvents` record offscreen progress. Canonical commit results remind the GM when an item is due or filled.
- `public.hooks` records mystery-hook lifecycle through `update_hook`, limits active pressure hooks to two, and requires novelty whenever a hook returns.

## Rationale

Prompt instructions may disappear during compaction and cannot be reconciled mechanically. State-backed ledgers survive compaction and give audit tools explicit records to check.

Enforcement depends on what the engine can verify. Obligations reject commits because a missing domain event, such as `add-wound`, is machine-checkable. Clock and hook follow-up remains a narrative judgment, so those ledgers require summaries and reasons and return reminders instead of rejecting the turn. A hard gate on an unverifiable narrative claim would encourage filler rather than reliable state.

ADR 0002 makes hard rejection practical. The settlement pass handles the error and retries before the render pass produces player-visible prose.
