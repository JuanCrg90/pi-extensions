import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { setCollapsedGroups } from "./state.js";
import { findNextGroupId, findPreviousGroupId } from "./widget.js";
import type { TodoState } from "./tools.js";

export interface ShortcutDeps {
  state: TodoState;
  projectPath: string;
  refreshWidget: (ctx: ExtensionContext) => void;
}

export function registerShortcuts(pi: ExtensionAPI, deps: ShortcutDeps): void {
  const { state, projectPath, refreshWidget } = deps;

  pi.registerShortcut("ctrl+shift+t", {
    description: "Toggle todo widget visibility",
    handler: async (ctx) => {
      state.widgetVisible = !state.widgetVisible;
      refreshWidget(ctx);
      ctx.ui.notify(`Todo widget ${state.widgetVisible ? "on" : "off"}`, "info");
    },
  });

  pi.registerShortcut("ctrl+shift+o", {
    description: "Expand all todo groups",
    handler: async (ctx) => {
      if (!state.widgetState) return;
      const updated = setCollapsedGroups(projectPath, state.widgetState, new Set());
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+c", {
    description: "Collapse all todo groups",
    handler: async (ctx) => {
      if (!state.widgetState) return;
      const allGroupIds = new Set(state.widgetState.groups.map((g) => g.id));
      const updated = setCollapsedGroups(projectPath, state.widgetState, allGroupIds);
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });

  pi.registerShortcut("enter", {
    description: "Toggle focused todo group",
    handler: async (ctx) => {
      if (!state.widgetState || !state.focusedGroupId) return;
      const collapsed = new Set(state.widgetState.collapsedGroups);
      if (collapsed.has(state.focusedGroupId)) {
        collapsed.delete(state.focusedGroupId);
      } else {
        collapsed.add(state.focusedGroupId);
      }
      const updated = setCollapsedGroups(projectPath, state.widgetState, collapsed);
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });

  pi.registerShortcut("space", {
    description: "Toggle focused todo group",
    handler: async (ctx) => {
      if (!state.widgetState || !state.focusedGroupId) return;
      const collapsed = new Set(state.widgetState.collapsedGroups);
      if (collapsed.has(state.focusedGroupId)) {
        collapsed.delete(state.focusedGroupId);
      } else {
        collapsed.add(state.focusedGroupId);
      }
      const updated = setCollapsedGroups(projectPath, state.widgetState, collapsed);
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });

  pi.registerShortcut("down", {
    description: "Focus next todo group",
    handler: async (ctx) => {
      if (!state.widgetState) return;
      state.focusedGroupId = findNextGroupId(
        state.widgetState.groups,
        state.focusedGroupId,
      );
      refreshWidget(ctx);
    },
  });

  pi.registerShortcut("up", {
    description: "Focus previous todo group",
    handler: async (ctx) => {
      if (!state.widgetState) return;
      state.focusedGroupId = findPreviousGroupId(
        state.widgetState.groups,
        state.focusedGroupId,
      );
      refreshWidget(ctx);
    },
  });

  pi.registerCommand("toggle-todo-widget", {
    description: "Toggle todo widget visibility",
    handler: async (_args, ctx) => {
      state.widgetVisible = !state.widgetVisible;
      refreshWidget(ctx);
      ctx.ui.notify(`Todo widget ${state.widgetVisible ? "on" : "off"}`, "info");
    },
  });

  pi.registerCommand("expand-todo-groups", {
    description: "Expand all todo groups",
    handler: async (_args, ctx) => {
      if (!state.widgetState) return;
      const updated = setCollapsedGroups(projectPath, state.widgetState, new Set());
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });

  pi.registerCommand("collapse-todo-groups", {
    description: "Collapse all todo groups",
    handler: async (_args, ctx) => {
      if (!state.widgetState) return;
      const allGroupIds = new Set(state.widgetState.groups.map((g) => g.id));
      const updated = setCollapsedGroups(projectPath, state.widgetState, allGroupIds);
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });
}
