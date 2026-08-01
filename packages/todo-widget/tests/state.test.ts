import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadState,
  saveState,
  deleteState,
  buildWidgetState,
  updateTaskState,
  setCollapsedGroups,
} from "../src/state.ts";
import { parseTodoList } from "../src/parser.ts";
import { withIds } from "../src/ids.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "todo-widget-"));
}

test("loadState returns empty object when no file exists", () => {
  const dir = tempDir();
  try {
    const state = loadState(dir);
    assert.deepEqual(state, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveState and loadState round-trip", () => {
  const dir = tempDir();
  try {
    saveState(dir, {
      projectTitle: "P",
      tasks: { "task-a:one": { state: "done" } },
      collapsedGroups: ["task-a"],
    });

    const state = loadState(dir);
    assert.equal(state.projectTitle, "P");
    assert.equal(state.tasks?.["task-a:one"].state, "done");
    assert.deepEqual(state.collapsedGroups, ["task-a"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildWidgetState merges persisted state and auto-collapses done groups", () => {
  const dir = tempDir();
  try {
    const parsed = parseTodoList(`# P

## Group A

- [x] One
- [x] Two

## Group B

- [ ] Three
`);
    const state = buildWidgetState(dir, parsed);

    assert.equal(state.projectTitle, "P");
    assert.equal(state.groups[0].id, "group-a");
    assert.equal(state.groups[0].tasks[0].state, "done");
    assert.equal(state.groups[0].tasks[1].state, "done");
    assert.ok(state.collapsedGroups.has("group-a"));
    assert.ok(!state.collapsedGroups.has("group-b"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("updateTaskState persists and updates widget state", () => {
  const dir = tempDir();
  try {
    const parsed = parseTodoList(`# P

## Group A

- [ ] One
- [ ] Two
`);
    let state = buildWidgetState(dir, parsed);
    state = updateTaskState(dir, state, "group-a:one", "done");

    assert.equal(state.groups[0].tasks[0].state, "done");
    assert.equal(state.groups[0].tasks[1].state, "not-started");
    assert.ok(!state.collapsedGroups.has("group-a"));

    state = updateTaskState(dir, state, "group-a:two", "done");
    assert.ok(state.collapsedGroups.has("group-a"));

    const persisted = loadState(dir);
    assert.equal(persisted.tasks?.["group-a:one"].state, "done");
    assert.equal(persisted.tasks?.["group-a:two"].state, "done");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setCollapsedGroups persists collapsed state", () => {
  const dir = tempDir();
  try {
    const parsed = parseTodoList(`# P

## Group A

- [ ] One
`);
    let state = buildWidgetState(dir, parsed);
    state = setCollapsedGroups(dir, state, new Set(["group-a"]));

    assert.ok(state.collapsedGroups.has("group-a"));
    const persisted = loadState(dir);
    assert.deepEqual(persisted.collapsedGroups, ["group-a"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deleteState removes the file", () => {
  const dir = tempDir();
  try {
    saveState(dir, { projectTitle: "P" });
    assert.ok(existsSync(join(dir, ".pi", "todo-widget-state.json")));
    deleteState(dir);
    assert.ok(!existsSync(join(dir, ".pi", "todo-widget-state.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
