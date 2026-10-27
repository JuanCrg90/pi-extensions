import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { eventGuide } from "../src/event-guide.ts";
import { createDebuggerState, createEventCollector, normalizeEvent } from "../src/events.ts";
import { createDebugServer } from "../src/server.ts";

describe("event guide", () => {
  it("documents every collected event exactly once with matching timeline categories", () => {
    const registered = new Set<string>();
    createEventCollector().register({
      on: (type: string) => registered.add(type),
    } as unknown as ExtensionAPI);

    assert.equal(eventGuide.length, registered.size);
    assert.deepEqual(new Set(eventGuide.map((entry) => entry.type)), registered);
    for (const entry of eventGuide) {
      assert.equal(entry.category, normalizeEvent(entry.type, {}).category);
      assert.ok(entry.description.trim(), `${entry.type} needs an explanation`);
      assert.ok(entry.inspect.trim(), `${entry.type} needs payload guidance`);
    }
  });

  it("serves the full guide before any events have been recorded", async (t) => {
    const collector = createEventCollector();
    const server = createDebugServer(collector.events, collector.bus, {
      pi: {} as ExtensionAPI,
      state: createDebuggerState(),
      traceDir: "/unused-empty-guide-test",
    });
    t.after(() => server.stop());
    const url = await server.start();

    const response = await fetch(`${url}/api/event-types`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await response.json(), eventGuide);
    assert.deepEqual(collector.events.snapshot(), []);

    const script = await fetch(`${url}/event-guide.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /javascript/);
    assert.match(await script.text(), /function initializeEventGuide/);
  });
});
