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
 *
 * Configuration:
 *   ~/.pi/agent/token-rate.json (optional)
 *   {
 *     "widgetVisible": true   // default — widget visible during streaming
 *   }
 *   Omit the file or the key to default to `true`. Set `false` to hide.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Text,
  type Component,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

// ─── Config ───────────────────────────────────────────────────────────
interface TokenRateConfig {
  widgetVisible?: boolean;
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "token-rate.json");

function loadConfig(): TokenRateConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as TokenRateConfig;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    // File missing, invalid JSON, or unreadable — fall back to defaults
  }
  return {};
}

const config: TokenRateConfig = loadConfig();

// ─── Shared module-level state ────────────────────────────────────────
let widgetVisible = config.widgetVisible ?? true;
let streamingActive = false;

function clearWidget(ctx: ExtensionContext): void {
  ctx.ui.setWidget("token-rate", []);
  widgetVisible = false;
}

function toggleWidget(ctx: ExtensionContext): boolean {
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
  theme: Theme,
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

// ─── Extension ────────────────────────────────────────────────────────
interface RateTracker {
  startTime: number;
  lastTokens: number;
  lastTime: number;
  currentRate: number;
}

let tracker: RateTracker | null = null;
let streamingText = "";
let streamingThinking = "";
let sessionTotalTokens = 0;

export default function (pi: ExtensionAPI): void {
  pi.on("message_start", (event) => {
    if (event.message.role === "assistant") {
      streamingText = "";
      streamingThinking = "";
      tracker = null;
      streamingActive = true;
    }
  });

  pi.on("message_update", async (_event, ctx) => {
    if (_event.message.role !== "assistant") return;

    const deltaEvent = _event.assistantMessageEvent;
    if (
      deltaEvent.type !== "text_delta" &&
      deltaEvent.type !== "thinking_delta"
    ) {
      return;
    }

    const text = deltaEvent.delta || "";
    if (!text) return;

    if (!tracker) {
      tracker = {
        startTime: Date.now(),
        lastTokens: 0,
        lastTime: Date.now(),
        currentRate: 0,
      };
    }

    const currentTracker = tracker;

    if (deltaEvent.type === "thinking_delta") {
      streamingThinking += text;
    } else {
      streamingText += text;
    }

    const textTokens = Math.max(0, Math.ceil(streamingText.length / CHARS_PER_TOKEN));
    const thinkingTokens = Math.max(
      0,
      Math.ceil(streamingThinking.length / CHARS_PER_TOKEN),
    );
    const estimatedTokens = Math.max(1, textTokens + thinkingTokens);

    // Prefer model-provided usage if available
    const usageOutput = _event.message.usage?.output;
    const effectiveTokens =
      usageOutput && usageOutput > estimatedTokens ? usageOutput : estimatedTokens;

    const now = Date.now();
    const tokenDelta = effectiveTokens - currentTracker.lastTokens;
    const timeDeltaMs = now - currentTracker.lastTime;

    if (tokenDelta > 0 && timeDeltaMs > 0) {
      const instantRate = (tokenDelta / timeDeltaMs) * 1000;
      currentTracker.currentRate = currentTracker.currentRate * 0.6 + instantRate * 0.4;
    }

    currentTracker.lastTokens = effectiveTokens;
    currentTracker.lastTime = now;

    const elapsed = now - currentTracker.startTime;
    const avgRate = elapsed > 0 ? (effectiveTokens / elapsed) * 1000 : 0;

    if (widgetVisible) {
      // Use factory function so setWidget passes theme
      ctx.ui.setWidget(
        "token-rate",
        (tui, theme) =>
          createTokenRateWidget(tui, theme, "⚡ Token Rate", [
            `Current:  ${currentTracker.currentRate.toFixed(1)} tok/s`,
            `Output:   ${textTokens}`,
            `Thinking: ${thinkingTokens}`,
            `Total:    ${effectiveTokens}`,
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
    const rawTextTokens = Math.max(
      0,
      Math.ceil(streamingText.length / CHARS_PER_TOKEN),
    );
    const rawThinkingTokens = Math.max(
      0,
      Math.ceil(streamingThinking.length / CHARS_PER_TOKEN),
    );
    const rawTotal = rawTextTokens + rawThinkingTokens;
    const usageOutput = event.message.usage?.output;
    const totalTokens =
      usageOutput && usageOutput > rawTotal ? usageOutput : rawTotal;

    // If the model reported a larger total, scale our output/thinking split
    // proportionally so the summary adds up to the reported number.
    let outputTokens = rawTextTokens;
    let thinkingTokens = rawThinkingTokens;
    if (usageOutput && usageOutput > rawTotal) {
      const scale = usageOutput / rawTotal;
      outputTokens = Math.round(rawTextTokens * scale);
      thinkingTokens = Math.round(rawThinkingTokens * scale);
    }

    // Providers that expose a reasoning breakdown give us exact thinking tokens.
    const reasoning = event.message.usage?.reasoning;
    if (reasoning && reasoning > 0 && reasoning <= totalTokens) {
      thinkingTokens = reasoning;
      outputTokens = totalTokens - thinkingTokens;
    }

    const avgRate = totalTime > 0 ? (totalTokens / totalTime) * 1000 : 0;

    // Accumulate session total
    sessionTotalTokens += totalTokens;

    if (widgetVisible) {
      ctx.ui.setWidget(
        "token-rate",
        (tui, theme) =>
          createTokenRateWidget(tui, theme, "⚡ Token Rate", [
            `Output:   ${outputTokens}`,
            `Thinking: ${thinkingTokens}`,
            `Total:    ${totalTokens}`,
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
