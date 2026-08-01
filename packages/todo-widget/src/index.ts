import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { createTodoWidget } from "./widget.js";
import { registerTools } from "./tools.js";
import { registerShortcuts } from "./shortcuts.js";

const currentProjectPath = (): string => process.cwd();

const isTui = (ctx: ExtensionContext): boolean => ctx.mode === "tui";

export default function todoWidget(pi: ExtensionAPI): void {
  const state = {
    widgetState: null,
    focusedGroupId: undefined,
    widgetVisible: true,
  };

  const projectPath = currentProjectPath();

  const refreshWidget = (ctx: ExtensionContext): void => {
    if (!isTui(ctx)) {
      return;
    }

    if (!state.widgetVisible || !state.widgetState) {
      ctx.ui.setWidget("todo-widget", []);
      return;
    }

    ctx.ui.setWidget(
      "todo-widget",
      (tui, theme) =>
        createTodoWidget(
          tui,
          theme as { fg: (c: string, s: string) => string; bold: (s: string) => string },
          {
            state: state.widgetState,
            focusedGroupId: state.focusedGroupId,
          },
        ),
    );
  };

  registerTools(pi, {
    state,
    projectPath,
    refreshWidget,
  });

  registerShortcuts(pi, {
    state,
    projectPath,
    refreshWidget,
  });

  pi.on("session_start", (_event, ctx) => {
    state.widgetState = null;
    state.focusedGroupId = undefined;
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
