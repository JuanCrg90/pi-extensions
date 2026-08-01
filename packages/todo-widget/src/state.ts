import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PersistedState, ParsedTodoList, TaskState, WidgetState } from "./types.js";
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

export function buildWidgetState(
  projectPath: string,
  parsed: ParsedTodoList,
): WidgetState {
  const withIdsList = withIds(parsed);
  const persisted = loadState(projectPath);

  const taskOverrides = persisted.tasks ?? {};
  const collapsedGroups = new Set(persisted.collapsedGroups ?? []);

  const groups = withIdsList.groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => ({
      ...task,
      state: (taskOverrides[task.id]?.state ?? task.state) as TaskState,
    })),
  }));

  const groupIds = groups.map((g) => g.id);
  const activeCollapsed = new Set(
    [...collapsedGroups].filter((id) => groupIds.includes(id)),
  );

  for (const group of groups) {
    const allDone = group.tasks.length > 0 && group.tasks.every((t) => t.state === "done");
    if (allDone) {
      activeCollapsed.add(group.id);
    }
  }

  return {
    projectTitle: parsed.projectTitle,
    groups,
    collapsedGroups: activeCollapsed,
  };
}

export function updateTaskState(
  projectPath: string,
  widgetState: WidgetState,
  taskId: string,
  state: TaskState,
): WidgetState {
  const persisted = loadState(projectPath);
  const tasks = { ...(persisted.tasks ?? {}) };
  tasks[taskId] = { state };
  saveState(projectPath, {
    projectTitle: widgetState.projectTitle,
    tasks,
    collapsedGroups: [...widgetState.collapsedGroups],
  });

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

  return { ...widgetState, groups, collapsedGroups };
}

export function setCollapsedGroups(
  projectPath: string,
  widgetState: WidgetState,
  collapsedGroups: Set<string>,
): WidgetState {
  const persisted = loadState(projectPath);
  saveState(projectPath, {
    projectTitle: widgetState.projectTitle,
    tasks: persisted.tasks,
    collapsedGroups: [...collapsedGroups],
  });
  return { ...widgetState, collapsedGroups };
}
