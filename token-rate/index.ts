/**
 * Token Rate Extension
 *
 * Displays tokens/sec in a bordered widget while the model is generating
 * a response. Uses `assistantMessageEvent` text deltas to count tokens in
 * real time, then shows final stats from `message_end`.
 *
 * Uses official Pi-TUI components: DynamicBorder (borders), Container (layout),
 * Text (content lines). Fully theme-aware and open-source ready.
 *
 * Usage:
 *   Place this file at ~/.pi/agent/extensions/token-rate/index.ts
 *   or .pi/extensions/token-rate/index.ts for project-local.
 *   Then restart pi — it auto-discovers on startup.
 *
 * Or test quickly:  pi -e ./token-rate
 */

import type { ExtensionAPI, AssistantMessageEvent } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Text,
  type Component,
  matchesKey,
  Key,
  truncateToWidth,
} from "@earendil-works/pi-tui";

// ─── Types ─────────────────────────────────────────────────────────────
type SetWidgetFn = (
  key: string,
  content: string[] | Component | ((tui: unknown, theme: { fg: (c: string, s: string) => string }) => Component),
) => void;

interface RateData {
  currentRate: number;
  avgRate: number;
  tokens: number;
  elapsed: number;
}

interface FinalData {
  tokens: number;
  time: number;
  avgRate: number;
  sessionTotal: number;
}

// ─── Utility ───────────────────────────────────────────────────────────
const CHARS_PER_TOKEN = 4;

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${min}m${s}s`;
}

// ─── Shared module-level state ────────────────────────────────────────
let widgetVisible = true;
let streamingActive = false;

function clearWidget(ctx: { ui: { setWidget: SetWidgetFn } }): void {
  ctx.ui.setWidget("token-rate", []);
  widgetVisible = false;
}

function toggleWidget(ctx: { ui: { setWidget: SetWidgetFn } }): boolean {
  widgetVisible = !widgetVisible;
  if (!widgetVisible) {
    ctx.ui.setWidget("token-rate", []);
  } else if (streamingActive) {
    ctx.ui.setWidget(
      "token-rate",
      (tui, theme) => createTokenRateWidget(tui, theme, "⚡ Token Rate", ["(toggle restored)"]),
    );
  }
  return widgetVisible;
}

// ─── TokenRateWidget — official TUI Component ─────────────────────────
/**
 * Creates a bordered TUI component displaying token rate data.
 *
 * Uses DynamicBorder + Container + Text for theme-aware rendering.
 * The factory pattern ensures theme changes are properly supported.
 *
 * See: Pattern 5 — Widgets Above/Below Editor
 *       https://github.com/earendil-works/pi/blob/main/docs/tui.md
 */
function createTokenRateWidget(
  _tui: unknown,
  theme: { fg: (c: string, s: string) => string },
  title: string,
  lines: string[],
): Component {
  const container = new Container();

  // Top border
  container.addChild(new DynamicBorder((s: string) => theme.fg("borderAccent", s)));

  // Title line
  container.addChild(new Text(title, 1, 0));

  // Body lines
  for (const line of lines) {
    container.addChild(new Text(line, 1, 0));
  }

  // Bottom border
  container.addChild(new DynamicBorder((s: string) => theme.fg("borderAccent", s)));

  const cached: { lines: string[]; width: number } = { lines: [], width: 0 };

  return {
    render(width: number): string[] {
      if (cached.lines.length > 0 && cached.width === width) {
        return cached.lines;
      }
      const rendered = container.render(width);
      cached.lines = rendered.map((l) => truncateToWidth(l, width));
      cached.width = width;
      return cached.lines;
    },

    invalidate(): void {
      container.invalidate();
      cached.width = 0;
      cached.lines = [];
    },

    handleInput(data: string): void {
      // Token rate widget is non-interactive; ignore input
    },
  };
}

// ─── Widget builders ──────────────────────────────────────────────────
function buildLiveWidget(data: RateData): Component {
  const lines = [
    `Current:  ${data.currentRate.toFixed(1)} tok/s`,
    `Average:  ${data.avgRate.toFixed(1)} tok/s`,
    `Tokens:   ${data.tokens}`,
    `Elapsed:  ${formatMs(data.elapsed)}`,
  ];
  return createTokenRateWidget(null, null as any, "⚡ Token Rate", lines);
}

function buildFinalWidget(data: FinalData): Component {
  const lines = [
    `Total:    ${data.tokens} tokens`,
    `Time:     ${formatMs(data.time)}`,
    `Avg rate: ${data.avgRate.toFixed(1)} tok/s`,
    `Session:  ${data.sessionTotal} tokens`,
  ];
  return createTokenRateWidget(null, null as any, "⚡ Token Rate", lines);
}

// ─── Extension ────────────────────────────────────────────────────────
interface RateTracker {
  startTime: number;
  lastTokens: number;
  lastTime: number;
  currentRate: number;
}

let tracker: RateTracker | null = null;
let streamingText = "";
let sessionTotalTokens = 0;

export default function (pi: ExtensionAPI): void {
  pi.on("message_start", (event) => {
    if (event.message.role === "assistant") {
      streamingText = "";
      tracker = null;
      streamingActive = true;
    }
  });

  pi.on("message_update", async (_event, ctx) => {
    if (_event.message.role !== "assistant") return;

    const deltaEvent = _event.assistantMessageEvent as AssistantMessageEvent;
    if (deltaEvent.type !== "text_delta") return;

    const text = (deltaEvent as { delta?: string }).delta || "";
    if (!text) return;

    if (!tracker) {
      tracker = {
        startTime: Date.now(),
        lastTokens: 0,
        lastTime: Date.now(),
        currentRate: 0,
      };
    }

    streamingText += text;
    const estimatedTokens = Math.max(1, Math.ceil(streamingText.length / CHARS_PER_TOKEN));

    // Prefer model-provided usage if available
    const totalUsage = (_event.message.usage as { total?: number } | undefined)?.total;
    const effectiveTokens =
      totalUsage && totalUsage > estimatedTokens ? totalUsage : estimatedTokens;

    const now = Date.now();
    const tokenDelta = effectiveTokens - tracker.lastTokens;
    const timeDeltaMs = now - tracker.lastTime;

    if (tokenDelta > 0 && timeDeltaMs > 0) {
      const instantRate = (tokenDelta / timeDeltaMs) * 1000;
      tracker.currentRate = tracker.currentRate * 0.6 + instantRate * 0.4;
    }

    tracker.lastTokens = effectiveTokens;
    tracker.lastTime = now;

    const elapsed = now - tracker.startTime;
    const avgRate = elapsed > 0 ? (effectiveTokens / elapsed) * 1000 : 0;

    if (widgetVisible) {
      // Use factory function so setWidget passes theme
      ctx.ui.setWidget(
        "token-rate",
        (tui, theme) =>
          createTokenRateWidget(tui, theme, "⚡ Token Rate", [
            `Current:  ${tracker.currentRate.toFixed(1)} tok/s`,
            `Average:  ${avgRate.toFixed(1)} tok/s`,
            `Tokens:   ${effectiveTokens}`,
            `Elapsed:  ${formatMs(elapsed)}`,
          ]),
      );
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!tracker) return;

    streamingActive = false;

    const totalTime = Date.now() - tracker.startTime;
    const totalTokens =
      event.message.usage?.total ??
      Math.ceil(streamingText.length / CHARS_PER_TOKEN);
    const avgRate = totalTime > 0 ? (totalTokens / totalTime) * 1000 : 0;

    // Accumulate session total
    sessionTotalTokens += totalTokens;

    if (widgetVisible) {
      ctx.ui.setWidget(
        "token-rate",
        (tui, theme) =>
          createTokenRateWidget(tui, theme, "⚡ Token Rate", [
            `Total:    ${totalTokens} tokens`,
            `Time:     ${formatMs(totalTime)}`,
            `Avg rate: ${avgRate.toFixed(1)} tok/s`,
            `Session:  ${sessionTotalTokens} tokens`,
          ]),
      );
    }

    tracker = null;
  });

  pi.on("session_start", (_event, ctx) => {
    sessionTotalTokens = 0;
    streamingActive = false;
    clearWidget(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    streamingActive = false;
    clearWidget(ctx);
  });

  // Keyboard shortcut: ctrl+shift+t
  pi.registerShortcut("ctrl+shift+t", {
    description: "Toggle token rate widget",
    handler: async (ctx) => {
      const visible = toggleWidget(ctx);
      ctx.ui.notify(`Token rate widget: ${visible ? "on" : "off"}`, "info");
    },
  });

  // Slash command: /toggle-token-rate
  pi.registerCommand("toggle-token-rate", {
    description: "Toggle token rate widget visibility",
    handler: async (_args, ctx) => {
      const visible = toggleWidget(ctx);
      ctx.ui.notify(`Token rate widget: ${visible ? "on" : "off"}`, "info");
    },
  });
}
