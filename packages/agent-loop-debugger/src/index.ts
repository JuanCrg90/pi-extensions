/**
 * Agent Loop Debugger Extension for Pi
 *
 * Starts a local HTTP server that serves a vanilla-JS webapp and streams Pi
 * lifecycle events via Server-Sent Events.  Use `/agentloop` to toggle the
 * server on and off.
 *
 * Usage:
 *   pi -e ./agent-loop-debugger
 *
 * Commands:
 *   /agentloop   Start or stop the debugger server and print its URL.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createEventCollector } from "./events.ts";
import { createDebugServer } from "./server.ts";

// ─── Shared state ──────────────────────────────────────────────────────

const collector = createEventCollector(1000);
const server = createDebugServer(collector.events, collector.bus);

// ─── Command handler ───────────────────────────────────────────────────

async function toggleAgentLoop(_args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (server.url) {
    await server.stop();
    ctx.ui.notify("Agent loop debugger stopped", "info");
    return;
  }

  const url = await server.start();
  ctx.ui.notify(`Agent loop debugger: ${url}`, "info");
  // Also print to stdout for users running in non-TUI modes.
  console.log(`[agent-loop-debugger] ${url}`);
}

// ─── Extension entry point ─────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  collector.register(pi);

  pi.on("session_start", () => {
    collector.reset();
  });

  pi.registerCommand("agentloop", {
    description: "Start or stop the agent loop debugger server",
    handler: toggleAgentLoop,
  });
}
