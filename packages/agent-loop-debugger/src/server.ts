/**
 * HTTP + SSE server for the agent loop debugger.
 *
 * Serves the vanilla-JS webapp at `/` and streams normalized events at
 * `/events` via Server-Sent Events.  New connections replay the buffered
 * events, then receive live events through a pub/sub bus.
 *
 * Additional endpoints:
 *   GET  /api/events                    buffered events
 *   GET  /api/traces                    list saved traces
 *   GET  /api/traces/:filename          download a trace file
 *   POST /api/traces/load               load a trace into the buffer
 *   GET  /api/state/system-prompt       current system prompt
 *   GET  /api/state/tools               active tools with descriptions
 *   GET  /api/state/context             current context usage
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { DebuggerEvent, DebuggerState, EventBus, RingBuffer } from "./events.ts";
import { listTraces, loadTrace, saveTrace } from "./trace.ts";

let cachedIndexHtml: string | undefined;
let cachedIndexHtmlError = false;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export interface DebugServer {
  url: string | undefined;
  start(): Promise<string>;
  stop(): Promise<void>;
}

export interface DebugServerOptions {
  pi: ExtensionAPI;
  state: DebuggerState;
  traceDir: string;
}

function send(res: ServerResponse<IncomingMessage>, status: number, body: string, headers?: Record<string, string>): void {
  res.writeHead(status, headers ?? { "Content-Type": "text/plain" });
  res.end(body);
}

function sendJson(res: ServerResponse<IncomingMessage>, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json" });
}

function sendEvent(res: ServerResponse<IncomingMessage>, event: DebuggerEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function resolvePublicPath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  return join(dirname(modulePath), "..", "public");
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function safeJoin(base: string, filename: string): string | undefined {
  const clean = basename(filename);
  if (!clean || clean === "." || clean === "..") return undefined;
  const full = resolve(join(base, clean));
  const resolvedBase = resolve(base);
  if (!full.startsWith(resolvedBase + "/") && full !== resolvedBase) return undefined;
  return full;
}

export function createDebugServer(
  buffer: RingBuffer<DebuggerEvent>,
  bus: EventBus,
  options: DebugServerOptions,
): DebugServer {
  let server: Server | undefined;
  const { pi, state, traceDir } = options;

  const handleRequest = (req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/events") {
      handleEvents(req, res);
      return;
    }

    if (url.pathname === "/api/events") {
      handleApiEvents(req, res);
      return;
    }

    if (url.pathname === "/api/traces") {
      handleTraces(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/traces/")) {
      handleTraceFile(req, res, url.pathname.slice("/api/traces/".length));
      return;
    }

    if (url.pathname === "/api/state/system-prompt") {
      handleSystemPrompt(req, res);
      return;
    }

    if (url.pathname === "/api/state/tools") {
      handleTools(req, res);
      return;
    }

    if (url.pathname === "/api/state/context") {
      handleContext(req, res);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      handleIndex(req, res);
      return;
    }

    send(res, 404, "Not found");
  };

  const handleEvents = (req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    res.writeHead(200, SSE_HEADERS);

    // Replay buffered history so the viewer sees recent context.
    for (const event of buffer.snapshot()) {
      sendEvent(res, event);
    }

    const unsubscribe = bus.subscribe((event) => {
      if (res.writableEnded) {
        unsubscribe();
        return;
      }
      sendEvent(res, event);
    });

    req.on("close", () => {
      unsubscribe();
    });

    // Keep the connection alive until the client disconnects.
    res.write(": connected\n\n");
  };

  const handleApiEvents = (_req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    sendJson(res, 200, buffer.snapshot());
  };

  const handleTraces = async (_req: IncomingMessage, res: ServerResponse<IncomingMessage>): Promise<void> => {
    try {
      const traces = await listTraces(traceDir);
      sendJson(res, 200, traces);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
  };

  const handleTraceFile = async (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    rawName: string,
  ): Promise<void> => {
    if (req.method !== "GET" && req.method !== "POST") {
      send(res, 405, "Method not allowed");
      return;
    }

    const decoded = decodeURIComponent(rawName);
    const filepath = safeJoin(traceDir, decoded);
    if (!filepath) {
      send(res, 400, "Invalid trace filename");
      return;
    }

    if (req.method === "GET") {
      try {
        const content = readFileSync(filepath, "utf-8");
        send(res, 200, content, { "Content-Type": "application/json" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send(res, 404, `Trace not found: ${message}`);
      }
      return;
    }

    // POST loads the trace into the in-memory buffer.
    try {
      const events = await loadTrace(filepath);
      buffer.clear();
      for (const event of events) {
        buffer.push(event);
        bus.publish(event);
      }
      sendJson(res, 200, { loaded: events.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
  };

  const handleSystemPrompt = (_req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    sendJson(res, 200, {
      systemPrompt: state.systemPrompt,
      systemPromptOptions: state.systemPromptOptions,
    });
  };

  const handleTools = (_req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    try {
      const active = new Set(pi.getActiveTools());
      const all = pi.getAllTools();
      const tools = all.map((tool) => ({
        name: tool.name,
        description: tool.description,
        active: active.has(tool.name),
      }));
      sendJson(res, 200, tools);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
  };

  const handleContext = (_req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    const usage = state.ctx?.getContextUsage();
    sendJson(res, 200, usage ?? { tokens: null, contextWindow: 0, percent: null });
  };

  const handleIndex = (_req: IncomingMessage, res: ServerResponse<IncomingMessage>): void => {
    if (cachedIndexHtmlError) {
      send(res, 500, "Failed to load webapp");
      return;
    }
    if (cachedIndexHtml !== undefined) {
      send(res, 200, cachedIndexHtml, { "Content-Type": "text/html; charset=utf-8" });
      return;
    }
    try {
      cachedIndexHtml = readFileSync(join(resolvePublicPath(), "index.html"), "utf-8");
      send(res, 200, cachedIndexHtml, { "Content-Type": "text/html; charset=utf-8" });
    } catch {
      cachedIndexHtmlError = true;
      send(res, 500, "Failed to load webapp");
    }
  };

  async function persistTrace(): Promise<void> {
    const events = buffer.snapshot();
    if (events.length === 0) return;
    try {
      const filepath = await saveTrace(events, traceDir);
      console.log(`[agent-loop-debugger] Trace saved on stop: ${filepath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[agent-loop-debugger] Failed to save trace on stop: ${message}`);
    }
  }

  return {
    get url(): string | undefined {
      if (!server) return undefined;
      const address = server.address();
      if (address === null || typeof address === "string") return undefined;
      return `http://127.0.0.1:${address.port}`;
    },

    start(): Promise<string> {
      return new Promise((resolve, reject) => {
        if (server) {
          resolve(this.url ?? "");
          return;
        }

        server = createServer(handleRequest);
        server.on("error", reject);
        server.listen({ host: "127.0.0.1", port: 0 }, () => {
          resolve(this.url ?? "");
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.closeAllConnections();
        server.close(async () => {
          server = undefined;
          await persistTrace();
          resolve();
        });
      });
    },
  };
}
