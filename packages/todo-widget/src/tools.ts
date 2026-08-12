import type {
  ExtensionAPI,
  ExtensionContext,
  AgentToolUpdateCallback,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { parseTodoList, ParseError } from "./parser.js";
import type { TaskState, WidgetState } from "./types.js";
import {
  buildWidgetState,
  updateTaskState,
  deleteState,
  saveWidgetState,
} from "./state.js";
import {
  LoadTodoListParameters,
  UpdateTodoTaskParameters,
  ClearTodoListParameters,
} from "./schema.js";

type LoadTodoListParams = Static<typeof LoadTodoListParameters>;
type UpdateTodoTaskParams = Static<typeof UpdateTodoTaskParameters>;
type ClearTodoListParams = Static<typeof ClearTodoListParameters>;

interface TaskSummary {
  id: string;
  title: string;
  state: TaskState;
  groupId: string;
  groupTitle: string;
}

function buildTaskSummary(widgetState: WidgetState): TaskSummary[] {
  const summary: TaskSummary[] = [];
  for (const group of widgetState.groups) {
    for (const task of group.tasks) {
      summary.push({
        id: task.id,
        title: task.title,
        state: task.state,
        groupId: group.id,
        groupTitle: group.title,
      });
    }
  }
  return summary;
}

export interface TodoState {
  widgetState: WidgetState | null;
  focusedGroupId: string | undefined;
  widgetVisible: boolean;
}

interface ToolDeps {
  state: TodoState;
  refreshWidget: (ctx: ExtensionContext) => void;
}

export function registerTools(pi: ExtensionAPI, deps: ToolDeps): void {
  const { state, refreshWidget } = deps;

  pi.registerTool({
    name: "LoadTodoList",
    label: "Load Todo List",
    description:
      "Load a markdown task list into the persistent todo widget. Groups are second-level headings (##), tasks are list items with markers: - [ ] not-started, - [/] in-progress, - [x] done.",
    promptSnippet: "Load a markdown task list into the todo widget",
    promptGuidelines: [
      "Call LoadTodoList when starting a new plan or refreshing the current task list.",
      "Markdown format: first # heading is the project title, second-level ## headings are task groups, and - [ ] / - [/] / - [x] are tasks.",
      "LoadTodoList returns the exact task IDs that UpdateTodoTask requires — keep them for later updates.",
      "The widget appears in the TUI and persists state in the project-local .pi/todo-widget-state.json. Keep it in sync: call UpdateTodoTask whenever a task's state changes.",
    ],
    parameters: LoadTodoListParameters,

    async execute(
      _toolCallId: string,
      params: LoadTodoListParams,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      ctx: ExtensionContext,
    ) {
      let parsed;
      try {
        parsed = parseTodoList(params.markdown);
      } catch (err) {
        const message = err instanceof ParseError ? err.message : "Failed to parse markdown task list.";
        return {
          content: [{ type: "text", text: message }],
          details: { error: "parse_failed", message },
        };
      }

      const widgetState = buildWidgetState(ctx.cwd, parsed);

      state.widgetState = widgetState;
      state.focusedGroupId = widgetState.groups[0]?.id;
      state.widgetVisible = true;
      saveWidgetState(ctx.cwd, widgetState);

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
          tasks: buildTaskSummary(widgetState),
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
      "After you complete, start, or pause any todo task, you MUST call UpdateTodoTask to reflect it — the todo widget is the source of truth for task state.",
      "taskId must be a stable ID from the todo widget. Use the tasks list returned by LoadTodoList or ListTodoTasks to get exact IDs.",
      "Mark completed tasks with state \"done\", ongoing work with \"in-progress\", and untouched work \"not-started\".",
      "State changes persist to the project-local state file and refresh the widget.",
    ],
    parameters: UpdateTodoTaskParameters,

    async execute(
      _toolCallId: string,
      params: UpdateTodoTaskParams,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
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

      const taskExists = state.widgetState.groups.some((g) =>
        g.tasks.some((t) => t.id === params.taskId),
      );
      if (!taskExists) {
        return {
          content: [
            {
              type: "text",
              text: `Task ID ${params.taskId} not found. Use ListTodoTasks to see available task IDs.`,
            },
          ],
          details: { error: "task_not_found", taskId: params.taskId },
        };
      }

      const updated = updateTaskState(ctx.cwd, state.widgetState, params.taskId, params.state);
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
    name: "ListTodoTasks",
    label: "List Todo Tasks",
    description:
      "Return the current todo list with group and task IDs, titles, and states. Use this to get exact taskIds for UpdateTodoTask.",
    promptSnippet: "List the current todo tasks with their IDs",
    promptGuidelines: [
      "Call ListTodoTasks whenever you need exact taskIds or current states for UpdateTodoTask.",
      "Before finishing a task or summarizing progress, call ListTodoTasks and update every completed task with UpdateTodoTask.",
      "Returns groups, tasks, and current states without modifying anything.",
    ],
    parameters: Type.Object({}, { additionalProperties: false }),

    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
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

      const total = state.widgetState.groups.reduce((acc, g) => acc + g.tasks.length, 0);
      return {
        content: [
          {
            type: "text",
            text: `Current todo list: ${state.widgetState.projectTitle} (${state.widgetState.groups.length} groups, ${total} tasks).`,
          },
        ],
        details: {
          projectTitle: state.widgetState.projectTitle,
          groupCount: state.widgetState.groups.length,
          taskCount: total,
          tasks: buildTaskSummary(state.widgetState),
        },
      };
    },
  });

  pi.registerTool({
    name: "ClearTodoList",
    label: "Clear Todo List",
    description:
      "Clear the current todo list, remove the widget, and delete the project-local state file. Only use this when the user explicitly asks to clear the list.",
    promptSnippet: "Clear the todo list widget and persisted state when the user asks",
    promptGuidelines: [
      "Only call ClearTodoList when the user explicitly asks to clear the todo list.",
      "Do not call ClearTodoList automatically when a plan finishes, when switching contexts, or when the user leaves and returns.",
      "Set confirm: true to confirm deletion of persisted state.",
    ],
    parameters: ClearTodoListParameters,

    async execute(
      _toolCallId: string,
      params: ClearTodoListParams,
      _signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
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
      deleteState(ctx.cwd);

      refreshWidget(ctx);

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
