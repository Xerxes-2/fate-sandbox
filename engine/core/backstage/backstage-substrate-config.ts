/**
 * Backstage substrate config (engine-direct async director — see ADR 0005).
 *
 * Single source for the async faction-director run parameters. `run_parallel_line`
 * forks `pi -p` directly with these (backstage-spawn.ts); the start scripts and
 * docs must match (they cannot import TS, so they hardcode the same values with a
 * pointer back here).
 */

/**
 * The backstage director is NOT pinned to a separate model anymore: the child
 * `pi -p` runs WITHOUT `--model`, so it uses the default model from the game's
 * settings (`.pi/agent/settings.json` `defaultModel` — the same "main model" the
 * GM runs on). Call volume is low, so a separate cheap model (and its extra
 * API-key setup) is not worth the configuration surface. If a provider/billing
 * failure ever shows up in the spawn logs again, re-pin by adding `--model` back
 * in backstage-spawn.ts.
 */

/**
 * Durable session dir for director runs. The game runs under project isolation
 * (start.sh sets PI_CODING_AGENT_DIR=.pi/agent), and `.pi/agent/` is fully
 * gitignored (it already holds auth.json). The director is fed privateFacts
 * (hidden knowledge), so its session holds secrets at rest — keeping it under the
 * gitignored `.pi/agent/` tree means secrets-at-rest never enter the git-tracked
 * source, consistent with where auth.json lives. Resolved relative to the
 * project cwd by the spawned child.
 */
export const BACKSTAGE_SESSION_DIR = ".pi/agent/backstage-sessions";
