import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PersistedState, ParsedTodoList, TaskState, WidgetState, TaskGroup, Task } from "./types.js";
import { withIds } from "./ids.js";

const STATE_DIR = ".pi";
const STATE_FILE = "todo-widget-state.json";

const statePath = (projectPath: string): string => {
  return join(projectPath, STATE_DIR, STATE_FILE);
};

export function loadState(projectPath: string): PersistedState {
  const path = statePath(projectPath);
  if (!existsSync(path)) {
    return {};
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as PersistedState;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    // Corrupted or unreadable — start fresh
  }

  return {};
}

export function saveState(projectPath: string, state: PersistedState): void {
  const path = statePath(projectPath);
  mkdirSync(dirname(path), { recursive: true });

  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  renameSync(tempPath, path);
}

export function deleteState(projectPath: string): void {
  const path = statePath(projectPath);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

function taskRecordFromGroups(groups: TaskGroup[]): Record<string, { state: TaskState }> {
  const tasks: Record<string, { state: TaskState }> = {};
  for (const group of groups) {
    for (const task of group.tasks) {
      tasks[task.id] = { state: task.state };
    }
  }
  return tasks;
}

function persistedGroupsFromWidget(groups: TaskGroup[]): PersistedState["groups"] {
  return groups.map((group) => ({
    id: group.id,
    title: group.title,
    tasks: group.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      state: task.state,
    })),
  }));
}

export function saveWidgetState(projectPath: string, widgetState: WidgetState): void {
  saveState(projectPath, {
    projectTitle: widgetState.projectTitle,
    groups: persistedGroupsFromWidget(widgetState.groups),
    tasks: taskRecordFromGroups(widgetState.groups),
    collapsedGroups: [...widgetState.collapsedGroups],
  });
}

function restoreWidgetState(projectPath: string): WidgetState | null {
  const persisted = loadState(projectPath);
  if (!persisted.groups || persisted.groups.length === 0) {
    return null;
  }

  const collapsedGroups = new Set(persisted.collapsedGroups ?? []);
  const groups: TaskGroup[] = persisted.groups.map((group) => ({
    id: group.id,
    title: group.title,
    tasks: group.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      state: (persisted.tasks?.[task.id]?.state ?? task.state) as TaskState,
    })),
  }));

  return {
    projectTitle: persisted.projectTitle ?? "Tasks",
    groups,
    collapsedGroups,
  };
}

export function buildWidgetState(
  projectPath: string,
  parsed: ParsedTodoList,
): WidgetState {
  const withIdsList = withIds(parsed);
  const persisted = loadState(projectPath);

  // If the persisted list is for a different project title, discard its task state.
  const persistedTitleMatches = persisted.projectTitle === parsed.projectTitle;
  const taskOverrides = persistedTitleMatches ? (persisted.tasks ?? {}) : {};

  const groups = withIdsList.groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => ({
      ...task,
      state: (taskOverrides[task.id]?.state ?? task.state) as TaskState,
    })),
  }));

  const collapsedGroups = new Set(
    persistedTitleMatches ? (persisted.collapsedGroups ?? []) : [],
  );

  for (const group of groups) {
    const allDone = group.tasks.length > 0 && group.tasks.every((t) => t.state === "done");
    if (allDone) {
      collapsedGroups.add(group.id);
    }
  }

  return {
    projectTitle: parsed.projectTitle,
    groups,
    collapsedGroups,
  };
}

export function updateTaskState(
  projectPath: string,
  widgetState: WidgetState,
  taskId: string,
  state: TaskState,
): WidgetState {
  const groups = widgetState.groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) =>
      task.id === taskId ? { ...task, state } : task,
    ),
  }));

  const collapsedGroups = new Set(widgetState.collapsedGroups);
  for (const group of groups) {
    const allDone = group.tasks.length > 0 && group.tasks.every((t) => t.state === "done");
    if (allDone) {
      collapsedGroups.add(group.id);
    }
  }

  const updated: WidgetState = { ...widgetState, groups, collapsedGroups };
  saveWidgetState(projectPath, updated);
  return updated;
}

export function setCollapsedGroups(
  projectPath: string,
  widgetState: WidgetState,
  collapsedGroups: Set<string>,
): WidgetState {
  const updated: WidgetState = { ...widgetState, collapsedGroups };
  saveWidgetState(projectPath, updated);
  return updated;
}

export { restoreWidgetState };
