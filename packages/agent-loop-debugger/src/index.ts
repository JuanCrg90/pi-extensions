/**
 * Agent Loop Debugger Extension for Pi
 *
 * Starts a local HTTP server that serves a vanilla-JS webapp and streams Pi
 * lifecycle events via Server-Sent Events.  Use `/agentloop` to toggle the
 * server on and off, or `/agentloop list` and `/agentloop load <index|file>`
 * to manage saved traces.
 *
 * Usage:
 *   pi -e ./agent-loop-debugger
 *
 * Commands:
 *   /agentloop                    Start or stop the debugger server.
 *   /agentloop list               List saved trace files.
 *   /agentloop load <index|file>  Load a saved trace into the buffer.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { createDebuggerState, createEventCollector } from "./events.ts";
import { createDebugServer } from "./server.ts";
import { getDefaultTraceDir, listTraces, loadTrace, saveTrace } from "./trace.ts";

// ─── Shared state ──────────────────────────────────────────────────────

const traceDir = getDefaultTraceDir();

// ─── Command handler ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  const state = createDebuggerState();
  const collector = createEventCollector(1000, state);
  const server = createDebugServer(collector.events, collector.bus, { pi, state, traceDir });

  async function toggleServer(ctx: ExtensionCommandContext): Promise<void> {
    if (server.url) {
      await server.stop();
      ctx.ui.notify("Agent loop debugger stopped", "info");
      return;
    }

    const url = await server.start();
    ctx.ui.notify(`Agent loop debugger: ${url}`, "info");
    console.log(`[agent-loop-debugger] ${url}`);
  }

  async function listTracesCommand(ctx: ExtensionCommandContext): Promise<void> {
    const traces = await listTraces(traceDir);
    if (traces.length === 0) {
      const msg = "No saved traces found.";
      ctx.ui.notify(msg, "info");
      console.log(`[agent-loop-debugger] ${msg}`);
      return;
    }

    const lines = traces.map((trace, index) => {
      const when = new Date(trace.createdAt).toISOString();
      return `${index + 1}. ${when} — ${trace.eventCount} events — ${trace.filename}`;
    });
    const msg = `Saved traces (${traces.length}):\n${lines.join("\n")}`;
    ctx.ui.notify(msg, "info");
    console.log(`[agent-loop-debugger] ${msg}`);
  }

  async function loadTraceCommand(arg: string, ctx: ExtensionCommandContext): Promise<void> {
    const traces = await listTraces(traceDir);
    let filename = arg;

    if (/^\d+$/.test(arg.trim())) {
      const index = parseInt(arg, 10) - 1;
      if (index < 0 || index >= traces.length) {
        const msg = `Trace index ${arg} is out of range (1–${traces.length}).`;
        ctx.ui.notify(msg, "warning");
        console.log(`[agent-loop-debugger] ${msg}`);
        return;
      }
      filename = traces[index].filename;
    }

    const filepath = join(traceDir, filename);
    try {
      const events = await loadTrace(filepath);
      collector.reset();
      for (const event of events) {
        collector.events.push(event);
        collector.bus.publish(event);
      }

      if (!server.url) {
        const url = await server.start();
        ctx.ui.notify(`Loaded ${events.length} events from ${filename}\n${url}`, "info");
        console.log(`[agent-loop-debugger] Loaded ${events.length} events — ${url}`);
      } else {
        const msg = `Loaded ${events.length} events from ${filename}. The trace is now available in the timeline.`;
        ctx.ui.notify(msg, "info");
        console.log(`[agent-loop-debugger] ${msg}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const msg = `Failed to load trace ${filename}: ${message}`;
      ctx.ui.notify(msg, "error");
      console.error(`[agent-loop-debugger] ${msg}`);
    }
  }

  async function agentLoopCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const trimmed = args.trim();

    if (!trimmed) {
      await toggleServer(ctx);
      return;
    }

    const [subcommand, ...rest] = trimmed.split(/\s+/);
    const restArg = rest.join(" ");

    if (subcommand === "list") {
      await listTracesCommand(ctx);
      return;
    }

    if (subcommand === "load") {
      if (!restArg) {
        const msg = "Usage: /agentloop load <index|filename>";
        ctx.ui.notify(msg, "warning");
        console.log(`[agent-loop-debugger] ${msg}`);
        return;
      }
      await loadTraceCommand(restArg, ctx);
      return;
    }

    const msg = `Unknown /agentloop command: ${subcommand}`;
    ctx.ui.notify(msg, "warning");
    console.log(`[agent-loop-debugger] ${msg}`);
  }

  // ─── Event registration ──────────────────────────────────────────────

  collector.register(pi);

  pi.on("session_start", () => {
    collector.reset();
  });

  pi.on("session_shutdown", async () => {
    const events = collector.events.snapshot();
    if (events.length > 0) {
      try {
        const filepath = await saveTrace(events, traceDir);
        console.log(`[agent-loop-debugger] Trace saved: ${filepath}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[agent-loop-debugger] Failed to save trace: ${message}`);
      }
    }
  });

  pi.registerCommand("agentloop", {
    description: "Start/stop debugger, list traces, or load a trace",
    handler: agentLoopCommand,
  });
}
