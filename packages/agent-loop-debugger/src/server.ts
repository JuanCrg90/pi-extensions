/**
 * HTTP + SSE server for the agent loop debugger.
 *
 * Serves the vanilla-JS webapp at `/` and streams normalized events at
 * `/events` via Server-Sent Events.  New connections replay the buffered
 * events, then receive live events through a pub/sub bus.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DebuggerEvent, EventBus, RingBuffer } from "./events.ts";

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

function send(res: ServerResponse<IncomingMessage>, status: number, body: string, headers?: Record<string, string>): void {
  res.writeHead(status, headers ?? { "Content-Type": "text/plain" });
  res.end(body);
}

function sendEvent(res: ServerResponse<IncomingMessage>, event: DebuggerEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function resolvePublicPath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  return join(dirname(modulePath), "..", "public");
}

export function createDebugServer(
  buffer: RingBuffer<DebuggerEvent>,
  bus: EventBus,
): DebugServer {
  let server: Server | undefined;

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
    send(res, 200, JSON.stringify(buffer.snapshot(), null, 2), {
      "Content-Type": "application/json",
    });
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
        server.close(() => {
          server = undefined;
          resolve();
        });
      });
    },
  };
}
