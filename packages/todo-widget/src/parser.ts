import type { ParsedTodoList, TaskGroup, TaskState } from "./types.js";
import { sanitizeDisplayText } from "./sanitize.js";

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

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export function parseTodoList(markdown: string): ParsedTodoList {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let projectTitle: string | undefined;
  const groups: TaskGroup[] = [];
  let currentGroup: TaskGroup | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      // Only the first top-level heading is the project title
      if (projectTitle === undefined) {
        projectTitle = sanitizeDisplayText(h1Match[1]);
      }
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentGroup = {
        id: "",
        title: sanitizeDisplayText(h2Match[1]),
        tasks: [],
      };
      groups.push(currentGroup);
      continue;
    }

    const taskMatch = line.match(TASK_MARKER_RE);
    if (taskMatch && currentGroup) {
      currentGroup.tasks.push({
        id: "",
        title: sanitizeDisplayText(taskMatch[2]),
        state: stateFromMarker(taskMatch[1]),
      });
    }
  }

  if (groups.length === 0) {
    throw new ParseError("No task groups found. Markdown must contain at least one second-level heading (##).");
  }

  const totalTasks = groups.reduce((acc, g) => acc + g.tasks.length, 0);
  if (totalTasks === 0) {
    throw new ParseError("No tasks found. Each group must contain at least one task item (- [ ] / - [/] / - [x]).");
  }

  return { projectTitle: projectTitle ?? "Tasks", groups };
}
