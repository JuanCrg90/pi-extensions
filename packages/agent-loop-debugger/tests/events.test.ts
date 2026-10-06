import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EventBus,
  RingBuffer,
  createEventCollector,
  normalizeEvent,
  type DebuggerEvent,
  type EventCollector,
} from "../src/events.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("normalizeEvent", () => {
  it("produces the correct schema for a tool_call event", () => {
    const payload = {
      type: "tool_call",
      toolCallId: "call-1",
      toolName: "read",
      input: { path: "README.md" },
    };

    const event = normalizeEvent("tool_call", payload);

    assert.ok(event.id);
    assert.strictEqual(typeof event.id, "string");
    assert.strictEqual(typeof event.timestamp, "number");
    assert.ok(event.timestamp > 0);
    assert.strictEqual(event.category, "tool");
    assert.strictEqual(event.type, "tool_call");
    assert.ok(event.summary.includes("read"));
    assert.ok(event.summary.includes("README.md"));
    assert.deepStrictEqual(event.payload, payload);
  });

  it("summarizes a context event by message roles and count", () => {
    const payload = {
      type: "context",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ],
    };

    const event = normalizeEvent("context", payload);

    assert.strictEqual(event.category, "prompt");
    assert.ok(event.summary.includes("3"));
    assert.ok(event.summary.includes("system"));
    assert.ok(event.summary.includes("user"));
    assert.ok(event.summary.includes("assistant"));
  });

  it("summarizes a session_start event by reason", () => {
    const payload = { type: "session_start", reason: "startup" as const };

    const event = normalizeEvent("session_start", payload);

    assert.strictEqual(event.category, "session");
    assert.ok(event.summary.includes("startup"));
  });

  it("falls back to the event type for unknown events", () => {
    const event = normalizeEvent("custom_event", { foo: 1 });

    assert.strictEqual(event.category, "agent");
    assert.strictEqual(event.type, "custom_event");
    assert.strictEqual(event.summary, "custom_event");
  });
});

describe("RingBuffer", () => {
  it("pushes and snapshots in insertion order", () => {
    const buffer = new RingBuffer<number>(10);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    assert.deepStrictEqual(buffer.snapshot(), [1, 2, 3]);
  });

  it("wraps correctly when capacity is exceeded", () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);
    buffer.push(5);

    assert.deepStrictEqual(buffer.snapshot(), [3, 4, 5]);
  });

  it("clears all items", () => {
    const buffer = new RingBuffer<number>(5);
    buffer.push(1);
    buffer.push(2);
    buffer.clear();

    assert.deepStrictEqual(buffer.snapshot(), []);
  });
});

describe("EventBus", () => {
  it("delivers published events to subscribers", () => {
    const bus = new EventBus();
    const received: DebuggerEvent[] = [];

    bus.subscribe((event) => received.push(event));
    const event = normalizeEvent("agent_start", { type: "agent_start" });
    bus.publish(event);

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].type, "agent_start");
  });

  it("stops delivering after unsubscribe", () => {
    const bus = new EventBus();
    const received: DebuggerEvent[] = [];

    const unsubscribe = bus.subscribe((event) => received.push(event));
    unsubscribe();

    bus.publish(normalizeEvent("agent_start", { type: "agent_start" }));

    assert.deepStrictEqual(received, []);
  });

  it("does not let subscriber errors break other subscribers", () => {
    const bus = new EventBus();
    let received = 0;

    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe(() => {
      received++;
    });

    bus.publish(normalizeEvent("agent_start", { type: "agent_start" }));

    assert.strictEqual(received, 1);
  });
});

describe("createEventCollector", () => {
  it("registers handlers for all expected lifecycle events", () => {
    const registered = new Set<string>();
    const mockApi = {
      on: (event: string, _handler: unknown) => {
        registered.add(event);
      },
    } as unknown as ExtensionAPI;

    const collector: EventCollector = createEventCollector(100);
    collector.register(mockApi);

    assert.ok(registered.has("session_start"));
    assert.ok(registered.has("agent_start"));
    assert.ok(registered.has("agent_end"));
    assert.ok(registered.has("agent_settled"));
    assert.ok(registered.has("turn_start"));
    assert.ok(registered.has("turn_end"));
    assert.ok(registered.has("context"));
    assert.ok(registered.has("message_start"));
    assert.ok(registered.has("message_update"));
    assert.ok(registered.has("message_end"));
    assert.ok(registered.has("tool_call"));
    assert.ok(registered.has("tool_execution_start"));
    assert.ok(registered.has("tool_execution_update"));
    assert.ok(registered.has("tool_execution_end"));
    assert.ok(registered.has("tool_result"));
    assert.ok(registered.has("model_select"));
    assert.ok(registered.has("before_provider_request"));
    assert.ok(registered.has("after_provider_response"));
  });
});
