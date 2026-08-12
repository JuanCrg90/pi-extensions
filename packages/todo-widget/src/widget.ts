import {
  Container,
  Text,
  truncateToWidth,
  Component,
  matchesKey,
  Key,
} from "@earendil-works/pi-tui";
import type { WidgetState, TaskGroup } from "./types.js";

const stateSymbol = (state: TaskGroup["tasks"][number]["state"], theme: ThemeColors): string => {
  switch (state) {
    case "done":
      return theme.fg("success", "✓");
    case "in-progress":
      return theme.fg("warning", "◐");
    case "not-started":
    default:
      return theme.fg("muted", "○");
  }
};

const stateLabel = (state: TaskGroup["tasks"][number]["state"]): string => {
  switch (state) {
    case "done":
      return "done";
    case "in-progress":
      return "in-progress";
    case "not-started":
    default:
      return "pending";
  }
};

interface ThemeColors {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

interface WidgetRenderOptions {
  state: WidgetState;
  focusedGroupId?: string;
  onFocusGroup?: (groupId: string) => void;
  onToggleGroup?: (groupId: string) => void;
}

const borderColor = (theme: ThemeColors, s: string): string => theme.fg("borderAccent", s);

export function createTodoWidget(
  _tui: unknown,
  theme: ThemeColors,
  options: WidgetRenderOptions,
): Component {
  const container = new Container();

  const { state } = options;
  // Keyboard focus for enter/space toggling, seeded from the global focus state.
  let focusedId = options.focusedGroupId;
  const doneCount = state.groups.reduce(
    (acc, g) => acc + g.tasks.filter((t) => t.state === "done").length,
    0,
  );
  const totalCount = state.groups.reduce((acc, g) => acc + g.tasks.length, 0);

  const titleLine = `${theme.bold("📝 Todo")}  ${state.projectTitle}  (${doneCount}/${totalCount})`;
  container.addChild(new Text(titleLine, 1, 0));

  if (state.groups.length === 0) {
    container.addChild(new Text(theme.fg("dim", "  No tasks loaded."), 1, 0));
  }

  for (const group of state.groups) {
    const groupDone = group.tasks.every((t) => t.state === "done");
    const groupCount = group.tasks.filter((t) => t.state === "done").length;
    const expanded = !state.collapsedGroups.has(group.id);
    const isFocused = focusedId === group.id;

    const groupPrefix = expanded ? "▼" : "▶";
    const groupLine = `${groupPrefix} ${group.title} (${groupCount}/${group.tasks.length})`;
    const prefix = isFocused ? theme.fg("warning", "> ") : "  ";
    const coloredGroupLine = groupDone ? theme.fg("dim", groupLine) : groupLine;
    container.addChild(new Text(prefix + coloredGroupLine, 1, 0));

    if (expanded) {
      for (const task of group.tasks) {
        const sym = stateSymbol(task.state, theme);
        const label = stateLabel(task.state);
        const titleText = task.state === "done" ? theme.fg("dim", task.title) : task.title;
        const labelText =
          task.state === "done" ? theme.fg("dim", `(${label})`) : `(${label})`;
        const line = `    ${sym} ${titleText} ${labelText}`;
        container.addChild(new Text(line, 1, 0));
      }
    }
  }

  const cached: { lines: string[]; width: number } = { lines: [], width: 0 };

  return {
    render(width: number): string[] {
      if (cached.lines.length > 0 && cached.width === width) {
        return cached.lines;
      }
      const rendered = container.render(width);
      const topBorder = borderColor(theme, "─".repeat(Math.max(1, width)));
      const bottomBorder = borderColor(theme, "─".repeat(Math.max(1, width)));
      const body = rendered.map((l) => truncateToWidth(l, width));
      cached.lines = [topBorder, ...body, bottomBorder];
      cached.width = width;
      return cached.lines;
    },

    invalidate(): void {
      container.invalidate();
      cached.width = 0;
      cached.lines = [];
    },

    handleInput(data: string): void {
      // Focus prev/next group (arrow keys or j/k) and toggle the focused
      // group header with enter/space, matching the global shortcuts.
      if (matchesKey(data, Key.up) || data === "k") {
        const next = findPreviousGroupId(state.groups, focusedId);
        if (next) {
          focusedId = next;
          options.onFocusGroup?.(next);
          cached.width = 0;
          cached.lines = [];
        }
        return;
      }
      if (matchesKey(data, Key.down) || data === "j") {
        const next = findNextGroupId(state.groups, focusedId);
        if (next) {
          focusedId = next;
          options.onFocusGroup?.(next);
          cached.width = 0;
          cached.lines = [];
        }
        return;
      }
      if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
        if (focusedId) {
          options.onToggleGroup?.(focusedId);
          cached.width = 0;
          cached.lines = [];
        }
      }
    },
  };
}

export function findNextGroupId(groups: TaskGroup[], currentId: string | undefined): string | undefined {
  const ids = groups.map((g) => g.id);
  if (!currentId) return ids[0];
  const idx = ids.indexOf(currentId);
  if (idx === -1 || idx === ids.length - 1) return ids[0];
  return ids[idx + 1];
}

export function findPreviousGroupId(groups: TaskGroup[], currentId: string | undefined): string | undefined {
  const ids = groups.map((g) => g.id);
  if (!currentId) return ids[ids.length - 1];
  const idx = ids.indexOf(currentId);
  if (idx <= 0) return ids[ids.length - 1];
  return ids[idx - 1];
}
