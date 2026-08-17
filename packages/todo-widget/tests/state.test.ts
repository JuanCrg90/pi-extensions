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
  mergeWidgetState,
  updateTaskState,
  setCollapsedGroups,
  saveWidgetState,
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

test("mergeWidgetState merges new groups and tasks into existing state", () => {
  const dir = tempDir();
  try {
    // Seed an initial list
    const initial = parseTodoList(`# Project

## Group A

- [x] One
- [ ] Two
`);
    let state = buildWidgetState(dir, initial);
    state = updateTaskState(dir, state, "group-a:two", "in-progress");

    // Now load a second markdown that adds Group B and a new task in Group A
    const next = parseTodoList(`# Project

## Group A

- [x] One
- [ ] Two
- [ ] Three

## Group B

- [ ] Four
`);
    const result = mergeWidgetState(dir, next);

    assert.ok(result.merged);
    assert.equal(result.widgetState.projectTitle, "Project");
    assert.equal(result.widgetState.groups.length, 2);

    const groupA = result.widgetState.groups.find((g) => g.id === "group-a")!;
    const groupB = result.widgetState.groups.find((g) => g.id === "group-b")!;

    assert.equal(groupA.tasks.length, 3);
    assert.equal(groupA.tasks.find((t) => t.id === "group-a:one")!.state, "done");
    assert.equal(groupA.tasks.find((t) => t.id === "group-a:two")!.state, "in-progress"); // persisted wins
    assert.equal(groupA.tasks.find((t) => t.id === "group-a:three")!.state, "not-started"); // new from parsed

    assert.equal(groupB.tasks.length, 1);
    assert.equal(groupB.tasks[0].id, "group-b:four");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mergeWidgetState preserves groups not present in new markdown", () => {
  const dir = tempDir();
  try {
    const initial = parseTodoList(`# Project

## Group A

- [x] One

## Group B

- [ ] Two
`);
    const initialState = buildWidgetState(dir, initial);
    saveWidgetState(dir, initialState);

    // Reload with only Group A
    const next = parseTodoList(`# Project

## Group A

- [ ] One
`);
    const result = mergeWidgetState(dir, next);

    assert.ok(result.merged);
    assert.equal(result.widgetState.groups.length, 2);
    assert.ok(result.widgetState.groups.some((g) => g.id === "group-b"));
    assert.equal(
      result.widgetState.groups.find((g) => g.id === "group-b")!.tasks[0].state,
      "not-started",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mergeWidgetState returns merged=false when no prior state", () => {
  const dir = tempDir();
  try {
    const parsed = parseTodoList(`# Project

## Group A

- [ ] One
`);
    const result = mergeWidgetState(dir, parsed);

    assert.ok(!result.merged);
    assert.equal(result.widgetState.groups.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mergeWidgetState returns merged=false when project title differs", () => {
  const dir = tempDir();
  try {
    const initial = parseTodoList(`# Old Project

## Group A

- [x] One
`);
    buildWidgetState(dir, initial);

    const next = parseTodoList(`# New Project

## Group A

- [ ] One
`);
    const result = mergeWidgetState(dir, next);

    assert.ok(!result.merged);
    assert.equal(result.widgetState.groups[0].tasks[0].state, "not-started");
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
