import type { ParsedTodoList, TaskGroup, TaskState } from "./types.js";

const TASK_MARKER_RE = /^- \[([ x/])\]\s+(.*)$/;

const stateFromMarker = (marker: string): TaskState => {
  switch (marker) {
    case "x":
      return "done";
    case "/":
      return "in-progress";
    default:
      return "not-started";
  }
};

const stripMarkdown = (text: string): string => {
  return text.trim();
};

export function parseTodoList(markdown: string): ParsedTodoList {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let projectTitle = "Tasks";
  const groups: TaskGroup[] = [];
  let currentGroup: TaskGroup | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      projectTitle = stripMarkdown(h1Match[1]);
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentGroup = {
        id: "",
        title: stripMarkdown(h2Match[1]),
        tasks: [],
      };
      groups.push(currentGroup);
      continue;
    }

    const taskMatch = line.match(TASK_MARKER_RE);
    if (taskMatch && currentGroup) {
      currentGroup.tasks.push({
        id: "",
        title: stripMarkdown(taskMatch[2]),
        state: stateFromMarker(taskMatch[1]),
      });
    }
  }

  return { projectTitle, groups };
}
