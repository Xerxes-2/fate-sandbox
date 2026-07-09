/**
 * Showrunner audit substrate config (engine-direct sync auditor — see ADR 0007).
 *
 * Single source for the blocking `pi -p` auditor child parameters.
 * `run_showrunner_audit` forks the child with these (showrunner-spawn.ts).
 */

/**
 * Durable session dir for auditor runs. Sibling of BACKSTAGE_SESSION_DIR under the
 * gitignored `.pi/agent/` tree: the audit prompt embeds the Showrunner Projection
 * (hidden-canonical digests — offscreen event summaries, actor agendas), so the
 * child transcript must never enter git-tracked source. Resolved relative to the
 * project cwd by the spawned child.
 */
export const SHOWRUNNER_SESSION_DIR = ".pi/agent/showrunner-sessions";

/**
 * Blocking-call ceiling. Foreground audits historically finish in 1-3 minutes on
 * the default main model; past this the child is killed and the tool returns a
 * structured timeout failure (never a silent pass — ADR 0007 invariants).
 */
export const SHOWRUNNER_TIMEOUT_MS = 5 * 60_000;

/**
 * The only extension the auditor child loads (`--no-extensions -e <this>`): it
 * registers `lookup` and nothing else. Combined with `--no-builtin-tools` the
 * child is read-only by construction — no `read`, no `bash`, no domain tools.
 */
export const SHOWRUNNER_TIMELINE_EXTENSION = "extensions/subagents/timeline/index.ts";
