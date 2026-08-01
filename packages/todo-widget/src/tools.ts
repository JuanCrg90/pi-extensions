import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseTodoList } from "./parser.js";
import type { TaskState, WidgetState } from "./types.js";
import {
  buildWidgetState,
  updateTaskState,
  deleteState,
  saveWidgetState,
} from "./state.js";

interface LoadTodoListParams {
  markdown: string;
}

interface UpdateTodoTaskParams {
  taskId: string;
  state: TaskState;
}

interface ClearTodoListParams {
  confirm: boolean;
}

export interface TodoState {
  widgetState: WidgetState | null;
  focusedGroupId: string | undefined;
  widgetVisible: boolean;
}

export interface ToolDeps {
  state: TodoState;
  projectPath: string;
  refreshWidget: (ctx: ExtensionContext) => void;
}

export function registerTools(pi: ExtensionAPI, deps: ToolDeps): void {
  const { state, projectPath, refreshWidget } = deps;

  pi.registerTool({
    name: "LoadTodoList",
    label: "Load Todo List",
    description:
      "Load a markdown task list into the persistent todo widget. Groups are second-level headings (##), tasks are list items with markers: - [ ] not-started, - [/] in-progress, - [x] done.",
    promptSnippet: "Load a markdown task list into the todo widget",
    promptGuidelines: [
      "Use LoadTodoList when starting a new plan or refreshing the current task list.",
      "Markdown format: first # heading is the project title, second-level ## headings are task groups, and - [ ] / - [/] / - [x] are tasks.",
      "The widget appears in the TUI and persists state in the project-local .pi/todo-widget-state.json.",
    ],
    parameters: {
      type: "object",
      required: ["markdown"],
      properties: {
        markdown: {
          type: "string",
          description: "Markdown content containing the task list.",
        },
      },
    },

    async execute(
      _toolCallId: string,
      params: LoadTodoListParams,
      _signal: AbortSignal | undefined,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const parsed = parseTodoList(params.markdown);
      const widgetState = buildWidgetState(projectPath, parsed);

      state.widgetState = widgetState;
      state.focusedGroupId = widgetState.groups[0]?.id;
      state.widgetVisible = true;
      saveWidgetState(projectPath, widgetState);

      refreshWidget(ctx);

      const total = widgetState.groups.reduce((acc, g) => acc + g.tasks.length, 0);
      return {
        content: [
          {
            type: "text",
            text: `Loaded todo list: ${widgetState.projectTitle} (${widgetState.groups.length} groups, ${total} tasks).`,
          },
        ],
        details: {
          projectTitle: widgetState.projectTitle,
          groupCount: widgetState.groups.length,
          taskCount: total,
        },
      };
    },
  });

  pi.registerTool({
    name: "UpdateTodoTask",
    label: "Update Todo Task",
    description:
      "Update the state of a single task in the todo widget. State can be not-started, in-progress, or done.",
    promptSnippet: "Mark a todo task as not-started, in-progress, or done",
    promptGuidelines: [
      "Use UpdateTodoTask when the agent completes or starts a task.",
      "taskId must be a stable ID from the todo widget, typically task-<group-slug>:<item-slug>.",
      "State changes persist to the project-local state file and refresh the widget.",
    ],
    parameters: {
      type: "object",
      required: ["taskId", "state"],
      properties: {
        taskId: {
          type: "string",
          description: "Stable task ID from the todo widget.",
        },
        state: {
          type: "string",
          enum: ["not-started", "in-progress", "done"],
          description: "New task state.",
        },
      },
    },

    async execute(
      _toolCallId: string,
      params: UpdateTodoTaskParams,
      _signal: AbortSignal | undefined,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      if (!state.widgetState) {
        return {
          content: [
            {
              type: "text",
              text: "No todo list is loaded. Call LoadTodoList first.",
            },
          ],
          details: { error: "no_list_loaded" },
        };
      }

      const updated = updateTaskState(projectPath, state.widgetState, params.taskId, params.state);
      state.widgetState = updated;
      refreshWidget(ctx);

      return {
        content: [
          {
            type: "text",
            text: `Updated task ${params.taskId} to ${params.state}.`,
          },
        ],
        details: { taskId: params.taskId, state: params.state },
      };
    },
  });

  pi.registerTool({
    name: "ClearTodoList",
    label: "Clear Todo List",
    description:
      "Clear the current todo list, remove the widget, and delete the project-local state file.",
    promptSnippet: "Clear the todo list widget and persisted state",
    promptGuidelines: [
      "Use ClearTodoList when the plan is finished or you want to start over.",
      "Set confirm: true to confirm deletion of persisted state.",
    ],
    parameters: {
      type: "object",
      required: ["confirm"],
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to clear the list and delete state.",
        },
      },
    },

    async execute(
      _toolCallId: string,
      params: ClearTodoListParams,
      _signal: AbortSignal | undefined,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      if (!params.confirm) {
        return {
          content: [
            {
              type: "text",
              text: "ClearTodoList was not confirmed. Pass confirm: true to clear.",
            },
          ],
          details: { cleared: false },
        };
      }

      state.widgetState = null;
      state.focusedGroupId = undefined;
      state.widgetVisible = false;
      deleteState(projectPath);

      if (ctx.mode === "tui") {
        ctx.ui.setWidget("todo-widget", []);
      }

      return {
        content: [
          {
            type: "text",
            text: "Todo list cleared and state deleted.",
          },
        ],
        details: { cleared: true },
      };
    },
  });
}
