import { test } from "node:test";
import assert from "node:assert/strict";
import { createTodoWidget, findNextGroupId, findPreviousGroupId } from "../src/widget.ts";
import type { WidgetState, TaskGroup } from "../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const baseState: WidgetState = {
  projectTitle: "Project",
  groups: [
    {
      id: "task-group-a",
      title: "Group A",
      tasks: [
        { id: "task-group-a:one", title: "One", state: "done" },
        { id: "task-group-a:two", title: "Two", state: "not-started" },
      ],
    },
    {
      id: "task-group-b",
      title: "Group B",
      tasks: [
        { id: "task-group-b:three", title: "Three", state: "in-progress" },
      ],
    },
  ],
  collapsedGroups: new Set(),
};

test("createTodoWidget renders title and counts", () => {
  const widget = createTodoWidget(null, theme, { state: baseState });
  const lines = widget.render(80);
  const titleLine = lines.find((l) => l.includes("📝 Todo"));
  assert.ok(titleLine);
  assert.ok(titleLine.includes("Project"));
  assert.ok(titleLine.includes("(1/3)"));
});

test("createTodoWidget renders expanded groups", () => {
  const widget = createTodoWidget(null, theme, { state: baseState });
  const lines = widget.render(80);
  assert.ok(lines.some((l) => l.includes("Group A")));
  assert.ok(lines.some((l) => l.includes("One")));
  assert.ok(lines.some((l) => l.includes("Two")));
  assert.ok(lines.some((l) => l.includes("Group B")));
  assert.ok(lines.some((l) => l.includes("Three")));
});

test("createTodoWidget hides collapsed group tasks", () => {
  const state: WidgetState = {
    ...baseState,
    collapsedGroups: new Set(["task-group-a"]),
  };
  const widget = createTodoWidget(null, theme, { state });
  const lines = widget.render(80);
  assert.ok(lines.some((l) => l.includes("Group A")));
  assert.ok(!lines.some((l) => l.includes("One")));
  assert.ok(lines.some((l) => l.includes("Three")));
});

test("createTodoWidget shows empty message when no groups", () => {
  const state: WidgetState = {
    projectTitle: "Empty",
    groups: [],
    collapsedGroups: new Set(),
  };
  const widget = createTodoWidget(null, theme, { state });
  const lines = widget.render(80);
  assert.ok(lines.some((l) => l.includes("No tasks loaded")));
});

test("findNextGroupId cycles forward", () => {
  const groups = baseState.groups;
  assert.equal(findNextGroupId(groups, undefined), "task-group-a");
  assert.equal(findNextGroupId(groups, "task-group-a"), "task-group-b");
  assert.equal(findNextGroupId(groups, "task-group-b"), "task-group-a");
});

test("findPreviousGroupId cycles backward", () => {
  const groups = baseState.groups;
  assert.equal(findPreviousGroupId(groups, undefined), "task-group-b");
  assert.equal(findPreviousGroupId(groups, "task-group-b"), "task-group-a");
  assert.equal(findPreviousGroupId(groups, "task-group-a"), "task-group-b");
});
