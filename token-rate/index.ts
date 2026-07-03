/**
 * Token Rate Extension
 *
 * Displays tokens/sec in a widget while the model is generating a response.
 * Uses `assistantMessageEvent` text deltas to count tokens in real time,
 * then shows final stats from `message_end`.
 *
 * Usage:
 *   Place this file at ~/.pi/agent/extensions/token-rate/index.ts
 *   or .pi/extensions/token-rate/index.ts for project-local.
 *   Then restart pi — it auto-discovers on startup.
 *
 * Or test quickly:  pi -e ./token-rate
 */

import type { ExtensionAPI, AssistantMessageEvent } from "@earendil-works/pi-coding-agent";


const WIDGET_KEY = "token-rate";

// Approximate: 1 token ≈ 4 chars for English text
const CHARS_PER_TOKEN = 4;

// ─── Box widget component ────────────────────────────────────────────
class BoxWidget implements Component {
  private title: string;
  private lines: string[];
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(title: string, lines: string[]) {
    this.title = title;
    this.lines = lines;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const header = ` ${this.title} `;
    const padding = width - 2;
    const lineLen = Math.max(header.length, ...this.lines.map(l => l.length), 6);
    const w = Math.min(lineLen + 2, padding);

    const top    = "┌" + "─".repeat(w) + "┐";
    const headerPadded = header.padEnd(w);
    const bottom = "└" + "─".repeat(w) + "┘";

    const body = this.lines.map(l => {
      const padded = l.padEnd(w);
      return `│${padded}│`;
    });

    this.cachedLines = [top, headerPadded, ...body, bottom];
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ─── Shared module-level state ───────────────────────────────────────
let widgetVisible = true;
let streamingActive = false;

function clearWidget(ctx: { ui: { setWidget: (key: string, lines: string[]) => void } }) {
  ctx.ui.setWidget(WIDGET_KEY, []);
  widgetVisible = false;
}

function toggleWidget(ctx: { ui: { setWidget: (key: string, lines: string[]) => void } }): boolean {
  widgetVisible = !widgetVisible;
  if (!widgetVisible) {
    ctx.ui.setWidget(WIDGET_KEY, []);
  } else if (streamingActive) {
    ctx.ui.setWidget(WIDGET_KEY, new BoxWidget("⚡ Token Rate",
      ["(toggle restored)"]));
  }
  return widgetVisible;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${min}m${s}s`;
}

function updateWidget(ctx: { ui: { setWidget: (key: string, lines: string[]) => void } }, data: {
  currentRate: number;
  avgRate: number;
  tokens: number;
  elapsed: number;
}) {
  if (!widgetVisible) return;
  ctx.ui.setWidget(WIDGET_KEY, new BoxWidget("⚡ Token Rate",
    [`Current:  ${data.currentRate.toFixed(1)} tok/s`,
     `Average:  ${data.avgRate.toFixed(1)} tok/s`,
     `Tokens:   ${data.tokens}`,
     `Elapsed:  ${formatMs(data.elapsed)}`],
  ));
}

function updateWidgetFinal(ctx: { ui: { setWidget: (key: string, lines: string[]) => void } }, data: {
  tokens: number;
  time: number;
  avgRate: number;
  sessionTotal: number;
}) {
  if (!widgetVisible) return;
  ctx.ui.setWidget(WIDGET_KEY, new BoxWidget("⚡ Token Rate",
    [`Total:    ${data.tokens} tokens`,
     `Time:     ${formatMs(data.time)}`,
     `Avg rate: ${data.avgRate.toFixed(1)} tok/s`,
     `Session:  ${data.sessionTotal} tokens`],
  ));
}

// ─── Extension ───────────────────────────────────────────────────────
interface RateTracker {
  startTime: number;
  lastTokens: number;
  lastTime: number;
  currentRate: number;
}

let tracker: RateTracker | null = null;
let streamingText = "";
let sessionTotalTokens = 0;

export default function (pi: ExtensionAPI) {
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
    const effectiveTokens = totalUsage && totalUsage > estimatedTokens
      ? totalUsage
      : estimatedTokens;

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

    updateWidget(ctx, {
      currentRate: tracker.currentRate,
      avgRate,
      tokens: effectiveTokens,
      elapsed,
    });
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!tracker) return;

    streamingActive = false;

    const totalTime = Date.now() - tracker.startTime;
    const totalTokens = event.message.usage?.total ?? Math.ceil(streamingText.length / CHARS_PER_TOKEN);
    const avgRate = totalTime > 0
      ? (totalTokens / totalTime) * 1000
      : 0;

    // Accumulate session total
    sessionTotalTokens += totalTokens;

    updateWidgetFinal(ctx, { tokens: totalTokens, time: totalTime, avgRate, sessionTotal: sessionTotalTokens });
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
