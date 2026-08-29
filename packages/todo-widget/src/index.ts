import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { createTodoWidget } from "./widget.js";
import { registerTools, type TodoState } from "./tools.js";
import { registerEnforcement } from "./enforce.js";
import { registerShortcuts } from "./shortcuts.js";
import { restoreWidgetState, setCollapsedGroups } from "./state.js";

const isTui = (ctx: ExtensionContext): boolean => ctx.mode === "tui";

export default function todoWidget(pi: ExtensionAPI): void {
  const state: TodoState = {
    widgetState: null,
    focusedGroupId: undefined,
    widgetVisible: true,
  };

  const refreshWidget = (ctx: ExtensionContext): void => {
    if (!isTui(ctx)) {
      return;
    }

    if (!state.widgetVisible || !state.widgetState) {
      ctx.ui.setWidget("todo-widget", []);
      return;
    }

    const widgetState = state.widgetState;
    ctx.ui.setWidget(
      "todo-widget",
      (tui, theme) =>
        createTodoWidget(
          tui,
          theme as { fg: (c: string, s: string) => string; bold: (s: string) => string },
          {
            state: widgetState,
            focusedGroupId: state.focusedGroupId,
            onFocusGroup: (groupId: string) => {
              state.focusedGroupId = groupId;
              refreshWidget(ctx);
            },
            onToggleGroup: (groupId: string) => {
              if (!state.widgetState) return;
              const collapsed = new Set(state.widgetState.collapsedGroups);
              if (collapsed.has(groupId)) {
                collapsed.delete(groupId);
              } else {
                collapsed.add(groupId);
              }
              state.widgetState = setCollapsedGroups(
                ctx.cwd,
                state.widgetState,
                collapsed,
              );
              refreshWidget(ctx);
            },
          },
        ),
    );
  };

  registerTools(pi, {
    state,
    refreshWidget,
  });

  registerEnforcement(pi, { state });

  registerShortcuts(pi, {
    state,
    refreshWidget,
  });

  pi.on("session_start", (_event, ctx) => {
    state.widgetState = restoreWidgetState(ctx.cwd);
    state.focusedGroupId = state.widgetState?.groups[0]?.id;
    state.widgetVisible = true;
    refreshWidget(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    state.widgetState = null;
    state.focusedGroupId = undefined;
    if (isTui(ctx)) {
      ctx.ui.setWidget("todo-widget", []);
    }
  });
}
