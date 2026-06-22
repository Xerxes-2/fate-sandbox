# Spike: in-process subagents for a synchronous `advance_parallel_line`

**Branch:** `spike/in-process-subagents` · **Status:** ABANDONED (round 4). Live smoke
test proved multi-point integration breakage; master keeps the old working
substrate. Branch + this doc retained as the recorded negative result. DO NOT MERGE.
**Candidate substrate:** [`@gotgenes/pi-subagents@17.2.0`](https://pi.dev/packages/@gotgenes/pi-subagents) (in-process hard fork of tintinweb's)

## Question

Phase 3 (backstage obligation loop) shelved a one-shot `advance_parallel_line`
tool because a domain tool **cannot synchronously invoke a subagent** — the
standard subagent runs as a separate pi **process**, and a tool's
`ExtensionContext` has no agent-spawn surface. We closed the loop with a pure
ledger + hard block instead.

`@gotgenes/pi-subagents` runs subagents **in-process** (same pi runtime, no
subprocess) and publishes a typed service on `globalThis`. Does that make the
synchronous one-shot feasible, and is it worth adopting?

## Verdict

**Technically feasible — confirmed at the source level and with a runnable spike.**
**The firewall IS cleanly reconstructable** via `@gotgenes/pi-permission-system`
(round 2 finding below), and the dual-package setup is collision-free. The
remaining gate is a **live-runtime coexistence spike** (needs the harness + a
model), which cannot be completed headless here. Recommendation unchanged for
now: the payoff is ergonomic-only (Phase 3 already guarantees correctness), so
migrate only if the manual three-step proves to be a real GM-failure source in
practice — and gate it behind the runtime spike.

## Round 2: can the secret firewall be reconstructed? (yes)

The blocker from round 1 was that `@gotgenes/pi-subagents` core always binds all
parent extensions into the child, so a `parallel-line` child would inherit every
domain tool. `@gotgenes/pi-permission-system@16.0.1` resolves this:

- **It is a pure companion — registers ZERO tools** (`grep registerTool
permsys/src/index.ts` → none). It only adds a `before_agent_start` handler,
  input/tool gates, subscribes to `@gotgenes/pi-subagents`' child lifecycle
  events, and publishes a permissions service. **No `subagent` tool collision**
  with `@gotgenes/pi-subagents`, which keeps the spawn tools + `getSubagentsService()`.
  So the dual-package setup gives BOTH the one-shot spawn service AND per-agent
  tool denial.
- **Tool denial works on extension tools** (`handlers/before-agent-start.ts`):
  `AgentPrepHandler.handle` resolves the child agent name, iterates the active
  tool set, drops every tool whose `getToolPermission(name, agent) === "deny"`
  via `toolRegistry.setActive(allowed)`, and sanitizes the prompt's
  available-tools section. Runs before the child's first turn.
- **`{ "*": deny, lookup: allow }` reconstructs the hermetic agent.** Tool
  surfaces resolve via `evaluate(toolName, "*", composedRules)` (`rule.ts`):
  last-match-wins over `wildcardMatch(rule.surface, surface) &&
wildcardMatch(rule.pattern, value)`. A universal `"*"` default denies all
  surfaces; a later `lookup` rule overrides for that one tool. So the
  `parallel-line` child ends up with **only `lookup`** active — exactly today's
  `tools: lookup` firewall, expressed as a denylist instead of an allowlist.
- **`lookup` survives the inheritance, no extra wiring.** The main GM already
  registers `lookup` itself (`registerAllTools` → `lookupToolDefinition`,
  `tools/registry.ts`), so a child inheriting the parent's extensions inherits
  `lookup` for free; the deny-all rule then leaves exactly that one tool. The
  subagent-only `extensions/subagents/timeline/index.ts` registration (the
  current per-subagent path) is just a re-wrap of the same `lookupTool` and is
  not needed under the inherit-then-denylist model. (Correction to an earlier
  spike note that claimed `lookup` was subagent-only — it is not.)

### Debt ledger (what migrating actually costs)

| Item                                                                                                              | Cost                        | Note                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `@gotgenes/pi-subagents` + `@gotgenes/pi-permission-system`; stop loading the unscoped harness `pi-subagents` | **unverified runtime risk** | both must not register `subagent` simultaneously — needs a live coexistence test                                                                                            |
| Rewrite `extension.ts:73` `subagent` interception                                                                 | medium                      | tool name stays `subagent`, but args `{agent,task,agentScope}` → `{subagent_type,prompt,description}`; port `task-injection.ts` to inject into `prompt`                     |
| Rewrite both `.pi/agents/*.md` frontmatter                                                                        | low-medium                  | `systemPromptMode→prompt_mode`; drop `inheritProjectContext/inheritSkills/extensions/agentScope`; add `permission: { "*": deny, lookup: allow }`                            |
| Audit child-context hook binding                                                                                  | **medium-unverified**       | child inherits ALL of our `extension.ts` — domain tools are denied, but our `session_start`/`tool_call`/UI-panel/compaction hooks still bind in the child and need guarding |
| Rewrite AGENTS.md subagent discipline                                                                             | low                         | the hard rules reference the now-removed frontmatter keys                                                                                                                   |
| Build `advance_parallel_line` (the payoff)                                                                        | low                         | `getSubagentsService()` → `spawn(foreground)` → `await waitForAll()` → `getRecord().result` → validate+land via existing firewall, outside any draft                        |
| Lose the unscoped chain/parallel/intercom/acceptance DSL                                                          | low                         | unused in gameplay                                                                                                                                                          |

**Lightest part:** the firewall itself (one `permission:` block) and the payoff
tool. **Heaviest/riskiest:** the substrate swap's runtime coexistence and the
child-context hook-binding audit — neither is verifiable headless. So the
_firewall_ debt is light, but the _total_ migration debt is not clearly below
the value of an ergonomic-only win. Next gate before any decision: a live
runtime spike loading both @gotgenes packages in the card, confirming no
`subagent` collision and that our extension's hooks behave in child sessions.

## What was validated

### 1. The synchronous one-shot control flow is real (runnable)

`spikes/in-process-subagents.spike.test.ts` (run: `node --import jiti/register
--test spikes/in-process-subagents.spike.test.ts`) proves the exact shape an
`advance_parallel_line` tool would run, against a stub service:

```ts
const { getSubagentsService } = await import("@gotgenes/pi-subagents");
const svc = getSubagentsService(); // reachable from globalThis inside a tool
const id = svc.spawn("parallel-line", prompt, { foreground: true, bypassQueue: true });
await svc.waitForAll(); // in-process: drives the agent loop to completion
const json = svc.getRecord(id)?.result; // completed record carries .result
// -> validate + land via the existing secret firewall (record_offscreen_event path)
```

Source confirmation (`src/service/service.ts`, `src/service/service-adapter.ts`,
`src/tools/foreground-runner.ts`):

- The public `SubagentsService.spawn()` returns an **id** (string), even with
  `foreground: true` — NOT the result. You retrieve output via
  `await waitForAll()` then `getRecord(id).result`.
- Internally a `spawnAndWait(): Promise<Subagent>` exists (used by the
  `subagent` tool's foreground runner) and returns the completed record, but it
  is **not** on the public service contract — external callers use the
  spawn→waitForAll→getRecord triad.
- `getSubagentsService()` reads `globalThis[Symbol.for("@gotgenes/pi-subagents:service")]`,
  so a **domain tool can grab it without it being threaded through
  `ExtensionContext`** — this is the crux that unblocks Phase 3.

Caveats baked into the spike:

- `waitForAll()` waits for **all** running/queued agents, not just yours.
- A failed/aborted run yields no record/result → the tool must **not** settle
  the backstage obligation (failure ≠ discharge — preserves Phase 3 semantics).
- The await blocks the parent tool for the whole sub-conversation (seconds to
  minutes).

### 2. Install + load compatibility

- Installs cleanly alongside our `0.79.9` pi deps (peer deps `>=0.75.0`; its
  `@sinclair/typebox ^0.34.49` does not conflict with our `typebox ^1.3.0`).
- **Runtime entry is raw TS**: `exports["."].default → ./src/service/service.ts`;
  `dist/` ships only `.d.ts`. Node's native type-stripping refuses TS under
  `node_modules`, so loading requires a TS-aware loader. pi loads extensions via
  `jiti` (already our devDep), so this is a non-issue inside pi but means plain
  `node --test` needs `--import jiti/register`.

## The firewall dealbreaker (and its mitigation)

Our `parallel-line` subagent is strictly hermetic — `tools: lookup` only, one
extension, `inheritSkills: false`, `systemPromptMode: replace`. It must NOT be
able to write canonical state or touch secret tools; it returns JSON candidates
that the parent validates + lands.

`createSubagentSession()` (`src/lifecycle/create-subagent-session.ts`):

- Creates the child with `tools: cfg.toolNames` where `toolNames =
registry.getToolNamesForType(type)` — and the `tools:` frontmatter only covers
  **built-ins** (read/bash/edit/write/grep/find/ls).
- Then **`await session.bindExtensions({})`** — _"Children always load the
  parent's extensions and skills."_ All parent extensions bind into the child.
- `applyRecursionGuard()` strips only `["subagent", "get_subagent_result",
"steer_subagent"]` from the active set.

**Consequence:** a `parallel-line` child in @gotgenes **core** would have every
one of our domain tools active — `commit_turn`, `record_offscreen_event`,
`reveal_secret`, `patch_state`, … That demolishes the secret firewall. The core
removed the `extensions` / `skills` / `isolated` frontmatter keys, so isolation
is **not expressible in the core alone**.

**Mitigation:** add the companion [`@gotgenes/pi-permission-system`](https://github.com/gotgenes/pi-permission-system)
and express the firewall as per-agent `permission:` deny rules in frontmatter
(its `before_agent_start` handler removes denied tools from the child before it
starts). So the firewall is recoverable — but only with a second package and a
rewrite from "allowlist one extension tool" to "denylist all domain tools."

## State-sync reframing

The user's intuition — _in-process fundamentally solves state sync_ — is true in
one mode: in-process means the child's tools resolve the **same `state-store`
singleton** as the parent, so a child could mutate live state directly. But that
**inverts our architecture**: our discipline is _child emits JSON → parent
validates + lands behind the secret firewall_. Letting the child write live
state trades the firewall for convenience. So the real, safe win here is the
**synchronous one-shot ergonomics**, not shared-state writes.

## Costs of migrating (why "not now")

1. **Different lineage.** This is a fork of tintinweb's, not our current unscoped
   `pi-subagents` (in `.pi/npm`). The `subagent` tool's args differ
   (`{subagent_type, prompt, description}` vs our `{agent, task, agentScope}`),
   so `extension.ts:73` interception + `extensions/subagents/timeline/task-injection.ts`
   need rewriting. We'd also lose the unscoped package's chain/parallel/intercom
   DSL.
2. **Coexistence collision.** Two extensions both registering a `subagent` tool —
   the existing one must be removed/replaced, not run side by side.
3. **Firewall rewrite.** +1 companion package (`pi-permission-system`), port the
   hermetic agent to `permission:` deny rules, re-validate no secret leakage.
4. **Child binds our `extension.ts`.** All domain tools + GM hooks initialize in
   the child context; needs auditing beyond the built-in recursion guard.
5. **Frontmatter rewrite** for both `.pi/agents/*.md` (`systemPromptMode →
prompt_mode`, drop `extensions`/`inheritSkills`/`agentScope`).
6. **Correctness is already done.** The Phase 3 ledger + hard block ships and is
   tested (528 tests). The one-shot removes GM manual steps; it does not fix a
   bug.

## Recommended future migration path (if/when we want the one-shot)

1. Adopt `@gotgenes/pi-subagents` + `@gotgenes/pi-permission-system`; remove the
   current unscoped subagents extension.
2. Port `parallel-line` / `timeline-showrunner` to the new frontmatter, with
   `permission:` deny rules reconstructing the secret firewall (deny every
   state-mutating / secret domain tool; allow only `lookup`).
3. Rewrite the `subagent` interception in `extension.ts` for the new arg shape;
   port `task-injection.ts`.
4. Add `advance_parallel_line`: grabs `getSubagentsService()`, `spawn(foreground,
bypassQueue)`, `await waitForAll()`, reads `getRecord(id).result`, then
   validates + lands through the **existing** `record_offscreen_event` firewall —
   strictly **outside** any `runDomainEventTool` draft (no concurrent mutation of
   the state singleton). On no-result/failure, leave the backstage obligation
   open (do not fake a discharge).
5. Re-run the full secret-leak + audit suite before trusting it.

## Artifacts on this branch

- `spikes/in-process-subagents.spike.test.ts` — runnable control-flow proof.
- `package.json` / lockfile — `@gotgenes/pi-subagents@17.2.0` +
  `@gotgenes/pi-permission-system@16.0.1` added.

## Round 3: migration executed — runtime validation checklist

Steps 1–3 + 5 of the migration path are now done on the branch (the
`advance_parallel_line` one-shot, step 4, is intentionally deferred until the
substrate is confirmed). Changes:

- `.pi/settings.json` packages: removed `npm:pi-subagents`, added
  `npm:@gotgenes/pi-subagents` + `npm:@gotgenes/pi-permission-system`.
- `start.sh` / `start.ps1`: removed the old pi-subagents `disableBuiltins` block.
- `.pi/agents/parallel-line.md` + `timeline-showrunner.md`: frontmatter →
  `prompt_mode: replace`, `tools: none`, `permission: { "*": deny, lookup: allow }`;
  dropped `name`/`extensions`/`inheritProjectContext`/`inheritSkills`/`systemPromptMode`.
- `extensions/subagents/timeline/task-injection.ts`: keyed on
  `subagent_type` + `prompt` (was `agent`/`task`/`tasks`/`chain`); test updated.
- `tools/state/run-parallel-line.ts`, `agents/gm-tool-policy.md`, `AGENTS.md`:
  calling convention → `subagent({ subagent_type, prompt })`, no `agentScope`.

**Headless status:** 527 tests pass, tsc + oxlint clean. The substrate behavior
itself is NOT exercisable headless (needs the harness + a model).

**Online validation (run `./start.sh`, watch for):**

1. **Install** — pi installs both @gotgenes packages into `.pi/npm` from
   `.pi/settings.json`. `@gotgenes/pi-permission-system` pulls `tree-sitter-bash`
   (a native build); if pnpm prints `Ignored build scripts`, run
   `pnpm -C .pi/npm approve-builds` (or the prompted command) so the permission
   gate's bash parser initializes.
2. **No `subagent` tool collision** — only one `subagent` tool exists (old
   removed). `/agents` should list `parallel-line` + `timeline-showrunner`.
3. **Firewall** — spawn `parallel-line`; its active tool set must be **only
   `lookup`** (every domain/secret tool denied). This is the critical secret
   check. If domain tools leak in, the permission policy did not resolve the
   child agent name — verify `.pi/agents/parallel-line.md` `permission:` parsed.
4. **Context injection** — the child's `prompt` must contain
   `<timeline_state_context>` (injected by `task-injection.ts`).
5. **Child-context hooks (the main unknown)** — the child inherits ALL `-e`
   extensions (our `extension.ts`, player-panel, two-pass-render,
   compaction-policy, rewind, player-choices). Their `session_start`/`tool_call`
   hooks bind in the child. Watch for: a player panel rendering inside the child,
   two-pass render firing on the child, `syncStateFromSessionManager` running
   against the child session, or errors at child spawn. If any misbehaves, guard
   our hooks to no-op in child sessions (subscribe to
   `subagents:child:session-created` to learn child session ids).
6. **Version compatibility** — pi-subagents 17.2.0 + permission-system 16.0.1
   are monorepo siblings; confirm the permission companion actually receives the
   child lifecycle event (firewall depends on it). If the child is not detected,
   the per-agent permission never applies → firewall silently off (check #3
   catches this).

If #3 and #5 pass, the substrate is sound and `advance_parallel_line` (step 4)
becomes a low-risk follow-up.

## Round 4: live smoke test — ABANDONED

Ran the substrate smoke prompt (GM → `subagent({ subagent_type: "parallel-line",
prompt: <ParallelLineInput + DIAG override> })`) against the live harness with
deepseek-v4-pro. Pulled the child's own transcript off disk
(`sessions/<parent>/tasks/<child>.jsonl`) plus the permission-system review log
and the installed @gotgenes source. Findings:

| # | Observed | Evidence | Verdict |
| - | -------- | -------- | ------- |
| 1 | **Context injection dead** | child's first user message = the raw prompt, **no `<timeline_state_context>`** | our parent-side `tool_call` → `event.input` mutation never reaches the @gotgenes child prompt (worked on the old substrate; the object/ordering differs) |
| 2 | **`lookup` not callable** | child assistant message: `toolCalls: NONE`, model emitted `<tool_call name="lookup">` as **plain text** then halted, **no ParallelLineOutput JSON** | child got **zero usable tools** (firewall-closed or tools-not-registered), not a leak — a working firewall would have left exactly `lookup` |
| 3 | **Firewall correctness** | child never attempted a domain tool | UNVERIFIED — but #2 (no lookup either) points to deny-closed, not open |
| 4 | **No valid output** | output was only the lookup text | the run was effectively empty |

**Root causes (source-level):**

- **Injection:** `@gotgenes/pi-subagents` builds the child prompt from the
  `subagent` tool's `prompt` arg (`buildAgentPrompt`, `create-subagent-session.ts`
  `systemPromptOverride: () => cfg.systemPrompt` + the user prompt). Our
  `extension.ts` `tool_call` hook mutates `event.input.prompt` parent-side; that
  mutation does not propagate into the child the way it did on the old
  separate-process substrate.
- **Firewall:** `@gotgenes/pi-permission-system` resolves the active agent name
  from `<active_agent name="...">` markers / `active_agent` session entries
  **designed for `pi-agent-router`** (`active-agent.ts`). `@gotgenes/pi-subagents`
  does inject that tag in `buildAgentPrompt`, yet the child still ended up with no
  `lookup` — so either `before_agent_start`'s `event.systemPrompt` doesn't carry
  the tag, or rule composition denied `lookup` too. Unresolved and fragile; the
  intended pairing is router-based, not in-process-subagent-based.

**Decision (user, criterion "migrate only if debt < mainline value"):** the payoff
is ergonomic-only — Phase 3's backstage-obligation ledger already guarantees
correctness and the manual three-step works on the old substrate. The two
headless-unverifiable runtime risks the round-2 debt ledger flagged both
**materialized** as real breakage. Debt > value. **Abandon the migration; stay on
master** (which retains `npm:pi-subagents`, the timeline extension, the
`tools: lookup` + `extensions:` frontmatter — injection and firewall both proven
there — plus the schema-migration fix). The in-process one-shot
`advance_parallel_line` stays shelved; Phase 3 remains the correctness guarantee.

**What carried back to master independently:** only the schema-migration fix
(each step sets its own target version) — cherry-picked as `5a9cf6e`. Everything
else here is spike-only and stays unmerged.
