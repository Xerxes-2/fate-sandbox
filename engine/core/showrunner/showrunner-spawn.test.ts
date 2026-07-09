import assert from "node:assert/strict";
import test from "node:test";

import { buildShowrunnerSpawnArgs } from "./showrunner-spawn.ts";
import {
  SHOWRUNNER_SESSION_DIR,
  SHOWRUNNER_TIMELINE_EXTENSION,
} from "./showrunner-substrate-config.ts";

void test("buildShowrunnerSpawnArgs composes the hermetic blocking pi -p argv", () => {
  const args = buildShowrunnerSpawnArgs("AUDIT PROMPT BODY", "PERSONA BODY", "sr-test-1");

  // headless / hermetic flags: no project extensions, no builtin tools, no
  // project context — the timeline extension (lookup only) is the sole loadout
  assert.ok(args.includes("-p"));
  assert.ok(args.includes("--no-extensions"));
  assert.deepEqual(args.slice(args.indexOf("--extension"), args.indexOf("--extension") + 2), [
    "--extension",
    SHOWRUNNER_TIMELINE_EXTENSION,
  ]);
  assert.ok(args.includes("--no-builtin-tools"));
  assert.ok(args.includes("--no-approve"));
  assert.ok(args.includes("--no-context-files"));
  assert.ok(args.includes("--no-skills"));
  assert.ok(args.includes("--no-prompt-templates"));
  // persona rides --system-prompt (replace semantics; no coding-agent identity)
  assert.deepEqual(
    args.slice(args.indexOf("--system-prompt"), args.indexOf("--system-prompt") + 2),
    ["--system-prompt", "PERSONA BODY"],
  );
  // no --model pin: the child inherits the settings default (main model)
  assert.equal(args.includes("--model"), false);
  assert.deepEqual(args.slice(args.indexOf("--session-dir"), args.indexOf("--session-dir") + 2), [
    "--session-dir",
    SHOWRUNNER_SESSION_DIR,
  ]);
  assert.deepEqual(args.slice(args.indexOf("--session-id"), args.indexOf("--session-id") + 2), [
    "--session-id",
    "sr-test-1",
  ]);
  // the prompt is the final positional arg (no shell, so no quoting concerns)
  assert.equal(args.at(-1), "AUDIT PROMPT BODY");
});
