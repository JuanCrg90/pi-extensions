import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PersistedState, PersistedGroup, ParsedTodoList, TaskState, WidgetState, TaskGroup, Task } from "./types.js";
import { withIds } from "./ids.js";

function groupFromPersisted(pg: PersistedGroup): TaskGroup {
  return {
    id: pg.id,
    title: pg.title,
    tasks: pg.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      state: task.state,
    })),
  };
}

function mergeGroups(
  existing: TaskGroup[],
  parsed: TaskGroup[],
  taskOverrides: Record<string, { state: TaskState }>,
): TaskGroup[] {
  const merged: TaskGroup[] = [];
  const seenGroupIds = new Set<string>();

  // Keep existing groups, merging in any new/updated tasks from parsed
  for (const existingGroup of existing) {
    const parsedGroup = parsed.find((g) => g.id === existingGroup.id);
    if (parsedGroup) {
      const mergedTasks: Task[] = [];
      const seenTaskIds = new Set<string>();

      // Preserve existing tasks; if a task also exists in parsed, the title
      // may have changed but state comes from persisted overrides.
      for (const existingTask of existingGroup.tasks) {
        const parsedTask = parsedGroup.tasks.find((t) => t.id === existingTask.id);
        mergedTasks.push({
          id: existingTask.id,
          title: parsedTask ? parsedTask.title : existingTask.title,
          state: taskOverrides[existingTask.id]?.state ?? existingTask.state,
        });
        seenTaskIds.add(existingTask.id);
      }

      // Add brand-new tasks from parsed
      for (const parsedTask of parsedGroup.tasks) {
        if (!seenTaskIds.has(parsedTask.id)) {
          mergedTasks.push({
            id: parsedTask.id,
            title: parsedTask.title,
            state: taskOverrides[parsedTask.id]?.state ?? parsedTask.state,
          });
        }
      }

      merged.push({
        id: existingGroup.id,
        title: parsedGroup.title,
        tasks: mergedTasks,
      });
    } else {
      // Group only in persisted — keep it untouched
      merged.push(existingGroup);
    }
    seenGroupIds.add(existingGroup.id);
  }

  // Add brand-new groups from parsed
  for (const parsedGroup of parsed) {
    if (!seenGroupIds.has(parsedGroup.id)) {
      merged.push({
        id: parsedGroup.id,
        title: parsedGroup.title,
        tasks: parsedGroup.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          state: taskOverrides[task.id]?.state ?? task.state,
        })),
      });
    }
  }

  return merged;
}

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

function autoCollapseDoneGroups(groups: TaskGroup[], baseCollapsed: Set<string>): Set<string> {
  const collapsedGroups = new Set(baseCollapsed);
  for (const group of groups) {
    const allDone = group.tasks.length > 0 && group.tasks.every((t) => t.state === "done");
    if (allDone) {
      collapsedGroups.add(group.id);
    }
  }
  return collapsedGroups;
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

  const collapsedGroups = autoCollapseDoneGroups(
    groups,
    new Set(persistedTitleMatches ? (persisted.collapsedGroups ?? []) : []),
  );

  return {
    projectTitle: parsed.projectTitle,
    groups,
    collapsedGroups,
  };
}

export function mergeWidgetState(
  projectPath: string,
  parsed: ParsedTodoList,
): { widgetState: WidgetState; merged: boolean } {
  const withIdsList = withIds(parsed);
  const persisted = loadState(projectPath);

  const persistedTitleMatches = persisted.projectTitle === parsed.projectTitle;

  // No prior state or different project — behave like a fresh load
  if (!persistedTitleMatches || !persisted.groups || persisted.groups.length === 0) {
    return { widgetState: buildWidgetState(projectPath, parsed), merged: false };
  }

  const taskOverrides = persisted.tasks ?? {};
  const existingGroups = persisted.groups.map(groupFromPersisted);
  const mergedGroups = mergeGroups(existingGroups, withIdsList.groups, taskOverrides);

  const collapsedGroups = autoCollapseDoneGroups(
    mergedGroups,
    new Set(persisted.collapsedGroups ?? []),
  );

  return {
    widgetState: {
      projectTitle: parsed.projectTitle,
      groups: mergedGroups,
      collapsedGroups,
    },
    merged: true,
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
