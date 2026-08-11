import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildStatusBlock,
  hasUnfinishedTasks,
  hasCompletionSignal,
  shouldNudge,
  buildNudgeMessage,
} from "../src/enforce.ts";
import type { WidgetState } from "../src/types.js";

function makeWidgetState(): WidgetState {
  return {
    projectTitle: "Test plan",
    collapsedGroups: new Set(),
    groups: [
      {
        id: "setup",
        title: "Setup",
        tasks: [
          { id: "setup:install", title: "Install deps", state: "done" },
          { id: "setup:config", title: "Configure env", state: "not-started" },
        ],
      },
      {
        id: "verify",
        title: "Verify",
        tasks: [
          { id: "verify:probe", title: "Probe token", state: "in-progress" },
        ],
      },
    ],
  };
}

test("hasUnfinishedTasks", () => {
  assert.equal(hasUnfinishedTasks(makeWidgetState()), true);
  const allDone = makeWidgetState();
  for (const group of allDone.groups) {
    for (const task of group.tasks) {
      task.state = "done";
    }
  }
  assert.equal(hasUnfinishedTasks(allDone), false);
});

test("buildStatusBlock lists unfinished tasks with ids and counts done", () => {
  const block = buildStatusBlock(makeWidgetState());
  assert.match(block, /Test plan" — 3 tasks: 1 done, 1 in-progress, 1 pending/);
  assert.match(block, /In-progress:/);
  assert.match(block, /- Verify: Probe token \(id: verify:probe\)/);
  assert.match(block, /Pending:/);
  assert.match(block, /- Setup: Configure env \(id: setup:config\)/);
  assert.match(block, /UpdateTodoTask/);
  assert.doesNotMatch(block, /Install deps/);
});

test("buildStatusBlock omits reminder when everything is done", () => {
  const allDone = makeWidgetState();
  for (const group of allDone.groups) {
    for (const task of group.tasks) {
      task.state = "done";
    }
  }
  const block = buildStatusBlock(allDone);
  assert.match(block, /3 done/);
  assert.doesNotMatch(block, /UpdateTodoTask/);
});

test("hasCompletionSignal", () => {
  for (const text of [
    "All done, task complete.",
    "Finished the implementation.",
    "The PR was merged.",
    "All tests pass.",
    "Wrapped up and ready for review.",
    "Task 2 is done.",
  ]) {
    assert.equal(hasCompletionSignal(text), true, text);
  }
  for (const text of [
    "",
    "Working on the implementation now.",
    "I am still finishing the setup.",
    "Let me read the file first.",
    "Undone work remains.",
  ]) {
    assert.equal(hasCompletionSignal(text), false, text);
  }
});

test("shouldNudge requires all conditions", () => {
  const base = {
    widgetState: makeWidgetState(),
    updateTodoCalledThisRun: false,
    workToolRanThisRun: true,
    nudgeFollowupRun: false,
    lastAssistantText: "All done.",
  };
  assert.equal(shouldNudge(base), true);

  assert.equal(shouldNudge({ ...base, widgetState: null }), false);
  assert.equal(shouldNudge({ ...base, nudgeFollowupRun: true }), false);
  assert.equal(shouldNudge({ ...base, updateTodoCalledThisRun: true }), false);
  assert.equal(shouldNudge({ ...base, workToolRanThisRun: false }), false);
  assert.equal(shouldNudge({ ...base, lastAssistantText: "Reading files." }), false);

  const allDone = makeWidgetState();
  for (const group of allDone.groups) {
    for (const task of group.tasks) {
      task.state = "done";
    }
  }
  assert.equal(shouldNudge({ ...base, widgetState: allDone }), false);
});

test("buildNudgeMessage lists unfinished task ids", () => {
  const message = buildNudgeMessage(makeWidgetState());
  assert.match(message, /UpdateTodoTask/);
  assert.match(message, /setup:config/);
  assert.match(message, /verify:probe/);
  assert.doesNotMatch(message, /Install deps/);
});
