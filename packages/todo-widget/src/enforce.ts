import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WidgetState } from "./types.js";
import type { TodoState } from "./tools.js";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export function hasUnfinishedTasks(widgetState: WidgetState): boolean {
  return widgetState.groups.some((group) =>
    group.tasks.some((task) => task.state !== "done"),
  );
}

/** Compact todo status block injected into every LLM call while a list is loaded. */
export function buildStatusBlock(widgetState: WidgetState): string {
  const pending: string[] = [];
  const inProgress: string[] = [];
  let done = 0;
  let total = 0;

  for (const group of widgetState.groups) {
    for (const task of group.tasks) {
      total += 1;
      if (task.state === "done") {
        done += 1;
      } else if (task.state === "in-progress") {
        inProgress.push(`- ${group.title}: ${task.title} (id: ${task.id})`);
      } else {
        pending.push(`- ${group.title}: ${task.title} (id: ${task.id})`);
      }
    }
  }

  const lines: string[] = [];
  lines.push(
    `[TodoWidget] "${widgetState.projectTitle}" — ${total} tasks: ${done} done, ` +
      `${inProgress.length} in-progress, ${pending.length} pending.`,
  );
  if (inProgress.length > 0) {
    lines.push("In-progress:", ...inProgress);
  }
  if (pending.length > 0) {
    lines.push("Pending:", ...pending);
  }
  if (inProgress.length > 0 || pending.length > 0) {
    lines.push(
      'When you complete a task, call UpdateTodoTask with its exact id and state "done".',
    );
  }
  return lines.join("\n");
}

const COMPLETION_SIGNAL_RE =
  /\b(done|complete[d]?|finish(ed|es)?|merged|shipped|landed|resolved|all tests? pass(ing)?|ready for review|wrapped up)\b/i;

export function hasCompletionSignal(text: string): boolean {
  return COMPLETION_SIGNAL_RE.test(text);
}

interface NudgeInput {
  widgetState: WidgetState;
  updateTodoCalledThisRun: boolean;
  workToolRanThisRun: boolean;
  nudgeFollowupRun: boolean;
  lastAssistantText: string;
}

/**
 * Decide whether to force a reconciliation turn after an agent run settles.
 * Guards against loops and noise: skip follow-up runs, runs that already
 * updated the widget, read-only runs, fully-done lists, and runs whose final
 * message shows no sign of completion.
 */
export function shouldNudge(input: NudgeInput): boolean {
  const widgetState = input.widgetState;
  if (input.nudgeFollowupRun) return false;
  if (input.updateTodoCalledThisRun) return false;
  if (!input.workToolRanThisRun) return false;
  if (!hasUnfinishedTasks(widgetState)) return false;
  return hasCompletionSignal(input.lastAssistantText);
}

export function buildNudgeMessage(widgetState: WidgetState): string {
  const unfinished = widgetState.groups.flatMap((group) =>
    group.tasks
      .filter((task) => task.state !== "done")
      .map((task) => `- ${group.title}: ${task.title} (id: ${task.id})`),
  );
  return [
    "The todo widget still lists unfinished tasks, but this run ended without updating it.",
    'Reconcile the todo list now: call ListTodoTasks to see current state, then call UpdateTodoTask for every task you completed (state "done"). If a task is still ongoing, mark it "in-progress".',
    "Unfinished tasks:",
    ...unfinished,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Hook registration
// ---------------------------------------------------------------------------

/** Read-only tools do not count as "work" for the completion nudge. */
const READ_ONLY_TOOLS = new Set(["read", "grep", "ls", "find", "ListTodoTasks"]);

interface EnforcementDeps {
  state: TodoState;
  /** Override the nudge; defaults to enabled unless TODO_WIDGET_NO_NUDGE=1. */
  nudgeEnabled?: boolean;
}

export function registerEnforcement(pi: ExtensionAPI, deps: EnforcementDeps): void {
  const { state } = deps;
  const nudgeEnabled = deps.nudgeEnabled ?? process.env.TODO_WIDGET_NO_NUDGE !== "1";

  let updateTodoCalledThisRun = false;
  let workToolRanThisRun = false;
  let pendingNudge = false;
  let nudgeFollowupRun = false;

  pi.on("agent_start", () => {
    updateTodoCalledThisRun = false;
    workToolRanThisRun = false;
    // A run triggered by our own nudge must not be nudged again (loop guard).
    nudgeFollowupRun = pendingNudge;
    pendingNudge = false;
  });

  pi.on("tool_execution_end", (event) => {
    if (event.toolName === "UpdateTodoTask") {
      updateTodoCalledThisRun = true;
    } else if (!READ_ONLY_TOOLS.has(event.toolName)) {
      workToolRanThisRun = true;
    }
  });

  // Keep the current todo state visible to the model on every LLM call.
  // The widget itself is TUI-only, so without this the model cannot see
  // what is pending and forgets to update it.
  pi.on("context", (event) => {
    const widgetState = state.widgetState;
    if (!widgetState) return;
    const block = buildStatusBlock(widgetState);
    if (!block) return;
    return {
      messages: [
        ...event.messages,
        {
          role: "custom",
          customType: "todo-widget-status",
          content: block,
          display: false,
          timestamp: Date.now(),
        },
      ],
    };
  });

  // Force a reconciliation turn when the agent settles with unfinished tasks
  // and a completion-sounding final message but no UpdateTodoTask call.
  pi.on("agent_settled", (_event, ctx) => {
    if (!nudgeEnabled) return;
    const widgetState = state.widgetState;
    if (!widgetState) return;
    if (
      !shouldNudge({
        widgetState,
        updateTodoCalledThisRun,
        workToolRanThisRun,
        nudgeFollowupRun,
        lastAssistantText: lastAssistantText(ctx),
      })
    ) {
      return;
    }

    pendingNudge = true;
    void pi.sendMessage(
      {
        customType: "todo-widget-nudge",
        content: buildNudgeMessage(widgetState),
        display: true,
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
  });
}

function lastAssistantText(ctx: ExtensionContext): string {
  try {
    const entries = ctx.sessionManager.getBranch();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "message" || entry.message.role !== "assistant") continue;
      const content = entry.message.content;
      const parts = (Array.isArray(content) ? content : []).filter(
        (block): block is { type: "text"; text: string } => block.type === "text",
      );
      const text = parts.map((block) => block.text).join("\n");
      if (text.trim()) return text;
    }
  } catch {
    // Session not available (e.g., headless/print mode) — no nudge source.
  }
  return "";
}
