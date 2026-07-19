# Guard pending backstage candidates with a harvest ledger

## Problem

After ADR 0005 moved the backstage director to a detached engine process, `run_parallel_line` returned a `run_id` but provided no supported retrieval path. Session filenames include an unpredictable ISO timestamp, and the pi-actors `inspect` tool has no record of engine-forked processes.

`harvest_backstage_candidate` now accepts the `run_id`. `engine/core/backstage/backstage-session-read.ts` finds `<sessionDir>/<ISO>_<runId>.jsonl`, selects the newest matching file by ISO prefix, and extracts the final assistant text.

The existing backstage obligation hard-blocks the next canonical commit until the line is settled, but it is line-scoped rather than run-scoped. A GM could call `resolve_backstage_line` with `outcome=no-change` before harvesting, clearing the obligation while discarding output already produced for that run.

## Decision

Schema v18 adds `secrets.backstagePendingHarvests`. Each marker stores `{runId, lineId, spawnedAt}`.

- `run_parallel_line` records a marker after spawn.
- `harvest_backstage_candidate` clears the matching marker after retrieval and validation.
- `record_offscreen_event` clears markers for the landed `lineId`, including manually landed candidates.
- `resolve_backstage_line` rejects while `assertNoUnharvestedPending` finds an unharvested run.

Canonical commit results from `commit_turn` and `progress_scene_beat` also append `formatPendingHarvestReminder` output for pending runs. A valid no-change result remains possible: harvest the candidate first, inspect it, then resolve the line.
