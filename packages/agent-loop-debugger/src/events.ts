/**
 * Event normalization, ring buffer, and pub/sub for the agent loop debugger.
 */

import type {
  AgentEndEvent,
  AgentSettledEvent,
  BeforeAgentStartEvent,
  ContextEvent,
  ExtensionAPI,
  MessageEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  SessionShutdownEvent,
  SessionStartEvent,
  ToolCallEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  ToolResultEvent,
  TurnEndEvent,
  TurnStartEvent,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";

// ─── Types ─────────────────────────────────────────────────────────────

export type EventCategory = "agent" | "tool" | "prompt" | "provider" | "session";

export interface DebuggerEvent {
  id: string;
  timestamp: number;
  category: EventCategory;
  type: string;
  summary: string;
  payload: unknown;
}

export type EventListener = (event: DebuggerEvent) => void;

// ─── Summary helpers ───────────────────────────────────────────────────

function truncate(text: string | undefined, maxLength = 120): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unstringifiable]";
  }
}

function summarizeBeforeAgentStart(event: BeforeAgentStartEvent): string {
  const promptPreview = truncate(event?.prompt);
  return `User turn: ${promptPreview}`;
}

function summarizeContext(event: ContextEvent): string {
  const messages = Array.isArray(event?.messages) ? event.messages : [];
  const roles = messages.map((m) => (m && "role" in m ? m.role : "unknown"));
  return `Context messages: ${messages.length} (${roles.join(", ")})`;
}

function summarizeMessageStart(event: MessageStartEvent): string {
  const role = event?.message && "role" in event.message ? String(event.message.role) : "unknown";
  return `Message start: ${role}`;
}

function summarizeMessageUpdate(event: MessageUpdateEvent): string {
  const role = event?.message && "role" in event.message ? String(event.message.role) : "unknown";
  const deltaType = event?.assistantMessageEvent?.type ?? "unknown";
  return `Message update: ${role} / ${deltaType}`;
}

function summarizeMessageEnd(event: MessageEndEvent): string {
  const role = event?.message && "role" in event.message ? String(event.message.role) : "unknown";
  return `Message end: ${role}`;
}

function summarizeToolCall(event: ToolCallEvent): string {
  const args = event?.input ? safeStringify(event.input) : "";
  return `Tool call: ${event?.toolName ?? "unknown"} ${truncate(args, 80)}`;
}

function summarizeToolExecutionStart(event: ToolExecutionStartEvent): string {
  return `Executing: ${event?.toolName ?? "unknown"} (${event?.toolCallId ?? "?"})`;
}

function summarizeToolExecutionUpdate(event: ToolExecutionUpdateEvent): string {
  return `Executing: ${event?.toolName ?? "unknown"} (partial)`;
}

function summarizeToolExecutionEnd(event: ToolExecutionEndEvent): string {
  const status = event?.isError ? "error" : "ok";
  return `Executed: ${event?.toolName ?? "unknown"} → ${status}`;
}

function summarizeToolResult(event: ToolResultEvent): string {
  return `Tool result: ${event?.toolName ?? "unknown"} (${event?.isError ? "error" : "ok"})`;
}

function summarizeModelSelect(event: { model?: { name?: string } }): string {
  return `Model: ${event?.model?.name ?? "unknown"}`;
}

// ─── Normalization ─────────────────────────────────────────────────────

function categoryForType(type: string): EventCategory {
  switch (type) {
    case "session_start":
    case "session_shutdown":
    case "session_info_changed":
    case "session_before_switch":
    case "session_before_fork":
    case "session_before_compact":
    case "session_compact":
    case "session_before_tree":
    case "session_tree":
      return "session";
    case "before_agent_start":
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_end":
      return "agent";
    case "context":
    case "message_update":
      return "prompt";
    case "tool_call":
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
    case "tool_result":
      return "tool";
    case "before_provider_request":
    case "after_provider_response":
      return "provider";
    default:
      return "agent";
  }
}

function summaryForEvent(type: string, payload: unknown): string {
  switch (type) {
    case "session_start":
      return `Session start: ${(payload as SessionStartEvent).reason}`;
    case "session_shutdown":
      return `Session shutdown: ${(payload as SessionShutdownEvent).reason}`;
    case "before_agent_start":
      return summarizeBeforeAgentStart(payload as BeforeAgentStartEvent);
    case "agent_start":
      return "Agent loop started";
    case "agent_end": {
      const messages = (payload as AgentEndEvent)?.messages;
      const count = Array.isArray(messages) ? messages.length : "?";
      return `Agent loop ended (${count} messages)`;
    }
    case "agent_settled":
      return "Agent run settled";
    case "turn_start":
      return `Turn ${(payload as TurnStartEvent)?.turnIndex ?? "?"} started`;
    case "turn_end":
      return `Turn ${(payload as TurnEndEvent)?.turnIndex ?? "?"} ended`;
    case "context":
      return summarizeContext(payload as ContextEvent);
    case "message_start":
      return summarizeMessageStart(payload as MessageStartEvent);
    case "message_update":
      return summarizeMessageUpdate(payload as MessageUpdateEvent);
    case "message_end":
      return summarizeMessageEnd(payload as MessageEndEvent);
    case "tool_call":
      return summarizeToolCall(payload as ToolCallEvent);
    case "tool_execution_start":
      return summarizeToolExecutionStart(payload as ToolExecutionStartEvent);
    case "tool_execution_update":
      return summarizeToolExecutionUpdate(payload as ToolExecutionUpdateEvent);
    case "tool_execution_end":
      return summarizeToolExecutionEnd(payload as ToolExecutionEndEvent);
    case "tool_result":
      return summarizeToolResult(payload as ToolResultEvent);
    case "model_select":
      return summarizeModelSelect(payload as { model?: { name?: string } });
    case "before_provider_request":
      return "Provider request sent";
    case "after_provider_response":
      return `Provider response: ${(payload as { status?: number })?.status ?? "?"}`;
    default:
      return type;
  }
}

export function normalizeEvent(type: string, payload: unknown): DebuggerEvent {
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    category: categoryForType(type),
    type,
    summary: summaryForEvent(type, payload),
    payload,
  };
}

// ─── Ring buffer ───────────────────────────────────────────────────────

export class RingBuffer<T> {
  private buffer: T[];
  private size = 0;
  private start = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    const index = (this.start + this.size) % this.capacity;
    this.buffer[index] = item;
    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.start = (this.start + 1) % this.capacity;
    }
  }

  snapshot(): T[] {
    const result: T[] = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[(this.start + i) % this.capacity];
    }
    return result;
  }

  clear(): void {
    this.size = 0;
    this.start = 0;
    this.buffer = new Array(this.capacity);
  }
}

// ─── Event collector ───────────────────────────────────────────────────

export interface EventCollector {
  readonly events: RingBuffer<DebuggerEvent>;
  readonly bus: EventBus;
  register(pi: ExtensionAPI): void;
  reset(): void;
}

export class EventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: DebuggerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Observe-only: never let listener errors break the agent loop.
      }
    }
  }
}

export function createEventCollector(bufferSize = 1000): EventCollector {
  const events = new RingBuffer<DebuggerEvent>(bufferSize);
  const bus = new EventBus();

  function record(type: string, payload: unknown): void {
    let event: DebuggerEvent;
    try {
      event = normalizeEvent(type, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      event = {
        id: randomUUID(),
        timestamp: Date.now(),
        category: "agent",
        type,
        summary: `${type} (normalization failed: ${message})`,
        payload,
      };
    }
    events.push(event);
    bus.publish(event);
  }

  return {
    events,
    bus,
    register(pi: ExtensionAPI): void {
      pi.on("session_start", (event) => record("session_start", event));
      pi.on("session_shutdown", (event) => record("session_shutdown", event));
      pi.on("before_agent_start", (event) => record("before_agent_start", event));
      pi.on("agent_start", (event) => record("agent_start", event));
      pi.on("agent_end", (event) => record("agent_end", event));
      pi.on("agent_settled", (event) => record("agent_settled", event as AgentSettledEvent));
      pi.on("turn_start", (event) => record("turn_start", event));
      pi.on("turn_end", (event) => record("turn_end", event));
      pi.on("context", (event) => record("context", event));
      pi.on("message_start", (event) => record("message_start", event));
      pi.on("message_update", (event) => record("message_update", event));
      pi.on("message_end", (event) => record("message_end", event));
      pi.on("tool_call", (event) => record("tool_call", event));
      pi.on("tool_execution_start", (event) => record("tool_execution_start", event));
      pi.on("tool_execution_update", (event) => record("tool_execution_update", event));
      pi.on("tool_execution_end", (event) => record("tool_execution_end", event));
      pi.on("tool_result", (event) => record("tool_result", event));
      pi.on("model_select", (event) => record("model_select", event));
      pi.on("before_provider_request", (event) => record("before_provider_request", event));
      pi.on("after_provider_response", (event) => record("after_provider_response", event));
    },
    reset(): void {
      events.clear();
    },
  };
}
