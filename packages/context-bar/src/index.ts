/**
 * Context Bar Extension for Pi
 *
 * Adds a persistent footer breakdown of how the active model's context window is
 * being used: system prompt, tools, MCP tools, skills, project memory files, and
 * conversation messages. Inspired by the Claude Code /context-bar mod.
 *
 * Usage:
 *   pi -e ./context-bar
 *
 * Commands:
 *   /context-bar   Toggle the footer on/off.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  CATEGORY_META,
  type CategoryKey,
  type CategoryMeta,
  type DisplayCategory,
  type GenericMessage,
  type SystemPromptOptions,
  categorizeSections,
  estimateTokens,
  formatPercent,
  formatTokens,
  messageText,
  parseSystemPromptSections,
  scaleCategories,
} from "./context.ts";

// ─── Types ─────────────────────────────────────────────────────────────

type ThemeBg =
  | "selectedBg"
  | "userMessageBg"
  | "customMessageBg"
  | "toolPendingBg"
  | "toolSuccessBg"
  | "toolErrorBg";

interface ToolInfo {
  name: string;
  description: string;
  parameters?: unknown;
  namespace?: { name?: string };
  exposure?: string;
}

interface Snapshot {
  usedTokens: number | null;
  contextWindow: number;
  compactThreshold: number | null;
  categories: Record<CategoryKey, number>;
}

// ─── Shared State ──────────────────────────────────────────────────────

const snapshot: Snapshot = {
  usedTokens: null,
  contextWindow: 0,
  compactThreshold: null,
  categories: {
    systemPrompt: 0,
    tools: 0,
    mcpTools: 0,
    skills: 0,
    projectContext: 0,
    messages: 0,
  },
};

let footerEnabled = true;
let tuiRef: TUI | undefined;

// ─── Snapshot Updates ──────────────────────────────────────────────────

function estimateToolTokens(pi: ExtensionAPI): {
  tools: number;
  mcpTools: number;
} {
  const active = new Set(pi.getActiveTools());
  const all = pi.getAllTools() as ToolInfo[];
  let tools = 0;
  let mcpTools = 0;

  for (const tool of all) {
    if (!active.has(tool.name)) continue;
    if (tool.exposure === "hidden") continue;

    const text = `${tool.name}: ${tool.description}\n${JSON.stringify(tool.parameters ?? {})}`;
    const tokens = estimateTokens(text);

    if (tool.namespace?.name?.startsWith("mcp__")) {
      mcpTools += tokens;
    } else {
      tools += tokens;
    }
  }

  return { tools, mcpTools };
}

function updateSystemPromptBreakdown(
  systemPrompt: string,
  systemPromptOptions: SystemPromptOptions,
  pi: ExtensionAPI,
): void {
  const sections = parseSystemPromptSections(systemPrompt);
  const sectionTokens = categorizeSections(sections);
  const toolTokens = estimateToolTokens(pi);

  snapshot.categories.systemPrompt = sectionTokens.systemPrompt ?? 0;
  snapshot.categories.tools = (sectionTokens.tools ?? 0) + toolTokens.tools;
  snapshot.categories.mcpTools = toolTokens.mcpTools;
  snapshot.categories.skills = sectionTokens.skills ?? 0;
  snapshot.categories.projectContext = sectionTokens.projectContext ?? 0;

  // Fallback when context files exist but are not in a rendered project_context section.
  if (!sections.project_context && systemPromptOptions.contextFiles?.length) {
    const fileTokens = systemPromptOptions.contextFiles.reduce(
      (sum: number, file: { content?: string }) =>
        sum + estimateTokens(file.content ?? ""),
      0,
    );
    snapshot.categories.projectContext += fileTokens;
  }
}

function updateMessageBreakdown(messages: GenericMessage[]): void {
  let total = 0;
  for (const message of messages) {
    if (message.role === "system") continue;
    total += estimateTokens(messageText(message));
  }
  snapshot.categories.messages = total;
}

function updateUsage(ctx: ExtensionContext): void {
  const usage = ctx.getContextUsage();
  if (usage) {
    snapshot.usedTokens = usage.tokens;
    snapshot.contextWindow = usage.contextWindow;
  } else if (ctx.model) {
    snapshot.contextWindow = ctx.model.contextWindow;
  }

  // Pi reserves 16384 tokens by default before triggering compaction.
  if (snapshot.contextWindow > 0) {
    snapshot.compactThreshold = Math.max(
      0,
      snapshot.contextWindow - 16384,
    );
  }
}

function resetSnapshot(): void {
  snapshot.usedTokens = null;
  snapshot.contextWindow = 0;
  snapshot.compactThreshold = null;
  for (const key of Object.keys(snapshot.categories) as CategoryKey[]) {
    snapshot.categories[key] = 0;
  }
}

// ─── Rendering ─────────────────────────────────────────────────────────

function renderPill(theme: Theme, percent: number, text: string): string {
  const bg: ThemeBg =
    percent >= 0.9 ? "toolErrorBg" : percent >= 0.7 ? "toolPendingBg" : "toolSuccessBg";
  return theme.fg("text", theme.bg(bg, text));
}

function renderSummaryLine(width: number, theme: Theme): string {
  const { used } = scaleCategories(snapshot.categories, snapshot.usedTokens);
  const percent =
    snapshot.contextWindow > 0 ? used / snapshot.contextWindow : 0;

  const left = theme.fg("accent", theme.bold("◆ context"));

  const rightParts: string[] = [
    `${formatTokens(used)} of ${formatTokens(snapshot.contextWindow)}`,
  ];
  if (snapshot.compactThreshold && snapshot.compactThreshold > 0) {
    rightParts.push(`compacts at ${formatTokens(snapshot.compactThreshold)}`);
  }
  rightParts.push(renderPill(theme, percent, ` ${formatPercent(percent)} `));

  const right = rightParts.join(" · ");
  const padding = Math.max(
    1,
    width - visibleWidth(left) - visibleWidth(right),
  );

  return truncateToWidth(left + " ".repeat(padding) + right, width);
}

function renderBar(
  width: number,
  theme: Theme,
  used: number,
  categories: DisplayCategory[],
): string {
  const free = Math.max(0, snapshot.contextWindow - used);
  const total = used + free;

  let bar = "";
  let usedWidth = 0;

  for (const { key, tokens } of categories) {
    const ratio = total > 0 ? tokens / total : 0;
    const segmentWidth = Math.max(0, Math.round(ratio * width));
    if (segmentWidth <= 0) continue;

    bar += theme.fg(CATEGORY_META[key].color, "█".repeat(segmentWidth));
    usedWidth += segmentWidth;
  }

  const freeWidth = Math.max(0, width - usedWidth);
  if (freeWidth > 0) {
    bar += theme.fg("dim", "█".repeat(freeWidth));
  }

  return truncateToWidth(bar, width);
}

interface LegendItem {
  text: string;
  color: CategoryMeta["color"];
}

function buildLegendItems(
  used: number,
  theme: Theme,
  categories: DisplayCategory[],
): LegendItem[] {
  const items: LegendItem[] = [];

  for (const { key, tokens } of categories) {
    items.push({
      text: `${CATEGORY_META[key].label} ${formatTokens(tokens)} ${formatPercent(tokens / used)}`,
      color: CATEGORY_META[key].color,
    });
  }

  if (snapshot.contextWindow > 0) {
    const free = Math.max(0, snapshot.contextWindow - used);
    if (free > 0) {
      items.push({
        text: `free ${formatTokens(free)}`,
        color: "dim",
      });
    }
  }

  return items;
}

function renderLegend(
  width: number,
  theme: Theme,
  used: number,
  categories: DisplayCategory[],
): string[] {
  const items = buildLegendItems(used, theme, categories);

  const lines: string[] = [];
  let current = "";

  for (const item of items) {
    const marker = theme.fg(item.color, "▌");
    const piece = `${marker} ${item.text}`;
    const separator = current === "" ? "" : "  ";

    if (
      current !== "" &&
      visibleWidth(current) + visibleWidth(separator) + visibleWidth(piece) > width
    ) {
      lines.push(truncateToWidth(current, width));
      current = piece;
    } else {
      current += separator + piece;
    }
  }

  if (current !== "") {
    lines.push(truncateToWidth(current, width));
  }

  return lines;
}

function renderFooter(width: number, theme: Theme): string[] {
  if (width < 20) {
    return [theme.fg("accent", "context")];
  }

  const { used, categories } = scaleCategories(
    snapshot.categories,
    snapshot.usedTokens,
  );

  const lines = [
    renderSummaryLine(width, theme),
    renderBar(width, theme, used, categories),
  ];
  lines.push(...renderLegend(width, theme, used, categories));
  return lines;
}

// ─── Footer Installation ───────────────────────────────────────────────

function installFooter(ctx: ExtensionContext): void {
  if (ctx.mode !== "tui") return;

  ctx.ui.setFooter((tui, theme) => {
    tuiRef = tui;

    return {
      invalidate() {
        // Render reads from the shared snapshot, so no cache to clear.
      },
      render(width: number): string[] {
        return renderFooter(width, theme);
      },
    };
  });
}

function requestRender(): void {
  tuiRef?.requestRender();
}

// ─── Extension Entry Point ─────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    resetSnapshot();
    updateUsage(ctx);
    if (footerEnabled) {
      installFooter(ctx);
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    updateUsage(ctx);
    // NOTE: tool/skill breakdowns only refresh at the start of a user turn.
    // Live tool activation changes won't show until the next turn.
    updateSystemPromptBreakdown(
      event.systemPrompt,
      event.systemPromptOptions as SystemPromptOptions,
      pi,
    );
    requestRender();
  });

  pi.on("context", async (event) => {
    updateMessageBreakdown(event.messages as GenericMessage[]);
    requestRender();
  });

  pi.on("message_end", async (_event, ctx) => {
    updateUsage(ctx);
    requestRender();
  });

  pi.on("agent_end", async (_event, ctx) => {
    updateUsage(ctx);
    requestRender();
  });

  pi.on("model_select", async (_event, ctx) => {
    updateUsage(ctx);
    requestRender();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.mode === "tui") {
      ctx.ui.setFooter(undefined);
    }
    tuiRef = undefined;
  });

  pi.registerCommand("context-bar", {
    description: "Toggle the context usage footer",
    handler: async (_args, ctx) => {
      footerEnabled = !footerEnabled;

      if (footerEnabled) {
        installFooter(ctx);
        requestRender();
      } else {
        ctx.ui.setFooter(undefined);
        tuiRef = undefined;
      }

      ctx.ui.notify(`Context bar ${footerEnabled ? "on" : "off"}`, "info");
    },
  });
}
