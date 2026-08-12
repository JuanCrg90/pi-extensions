import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { setCollapsedGroups } from "./state.js";
import { findNextGroupId, findPreviousGroupId } from "./widget.js";
import type { TodoState } from "./tools.js";

interface ShortcutDeps {
  state: TodoState;
  refreshWidget: (ctx: ExtensionContext) => void;
}

export function registerShortcuts(pi: ExtensionAPI, deps: ShortcutDeps): void {
  const { state, refreshWidget } = deps;

  const toggleVisibility = async (ctx: ExtensionContext): Promise<void> => {
    state.widgetVisible = !state.widgetVisible;
    refreshWidget(ctx);
    ctx.ui.notify(`Todo widget ${state.widgetVisible ? "on" : "off"}`, "info");
  };

  const expandAll = async (ctx: ExtensionContext): Promise<void> => {
    if (!state.widgetState) return;
    const updated = setCollapsedGroups(ctx.cwd, state.widgetState, new Set());
    state.widgetState = updated;
    refreshWidget(ctx);
  };

  const collapseAll = async (ctx: ExtensionContext): Promise<void> => {
    if (!state.widgetState) return;
    const allGroupIds = new Set(state.widgetState.groups.map((g) => g.id));
    const updated = setCollapsedGroups(ctx.cwd, state.widgetState, allGroupIds);
    state.widgetState = updated;
    refreshWidget(ctx);
  };

  pi.registerShortcut("ctrl+shift+l", {
    description: "Toggle todo widget visibility",
    handler: toggleVisibility,
  });

  pi.registerShortcut("ctrl+shift+o", {
    description: "Expand all todo groups",
    handler: expandAll,
  });

  pi.registerShortcut("ctrl+shift+c", {
    description: "Collapse all todo groups",
    handler: collapseAll,
  });

  pi.registerShortcut("ctrl+shift+return", {
    description: "Toggle focused todo group",
    handler: async (ctx) => {
      if (!state.widgetState || !state.focusedGroupId) return;
      const collapsed = new Set(state.widgetState.collapsedGroups);
      if (collapsed.has(state.focusedGroupId)) {
        collapsed.delete(state.focusedGroupId);
      } else {
        collapsed.add(state.focusedGroupId);
      }
      const updated = setCollapsedGroups(ctx.cwd, state.widgetState, collapsed);
      state.widgetState = updated;
      refreshWidget(ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+]", {
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

  pi.registerShortcut("ctrl+shift+[", {
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
      await toggleVisibility(ctx);
    },
  });

  pi.registerCommand("expand-todo-groups", {
    description: "Expand all todo groups",
    handler: async (_args, ctx) => {
      await expandAll(ctx);
    },
  });

  pi.registerCommand("collapse-todo-groups", {
    description: "Collapse all todo groups",
    handler: async (_args, ctx) => {
      await collapseAll(ctx);
    },
  });
}
