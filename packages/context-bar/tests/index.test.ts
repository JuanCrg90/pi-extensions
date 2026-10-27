import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertToLlm,
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import contextBar from "../src/index.ts";
import { estimateTokens, messageText } from "../src/context.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;

function createHarness() {
  const handlers = new Map<string, Handler>();
  let footer: ReturnType<FooterFactory> | undefined;
  let renderRequests = 0;
  let usage: ReturnType<ExtensionContext["getContextUsage"]> = {
    tokens: 190_000,
    contextWindow: 200_000,
    percent: 95,
  };
  const sessionManager = SessionManager.inMemory();
  const api = {
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand() {},
    getActiveTools: () => [],
    getAllTools: () => [],
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: "tui",
    model: { contextWindow: 200_000 },
    getContextUsage: () => usage,
    sessionManager,
    ui: {
      setFooter: (factory: FooterFactory | undefined) => {
        footer = factory?.(
          { requestRender: () => { renderRequests++; } } as unknown as Parameters<FooterFactory>[0],
          {
            fg: (_color: string, text: string) => text,
            bg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          } as Parameters<FooterFactory>[1],
          {} as Parameters<FooterFactory>[2],
        );
      },
    },
  } as unknown as ExtensionContext;
  contextBar(api);

  return {
    async emit(name: string, event: object = {}) {
      await handlers.get(name)?.({ type: name, ...event }, ctx);
    },
    render: () => footer!.render(240).join("\n"),
    get renderRequests() { return renderRequests; },
    setUsage: (next: typeof usage) => { usage = next; },
    sessionManager,
  };
}

describe("context bar compaction lifecycle", () => {
  for (const reason of ["threshold", "overflow", "manual"] as const) {
    it(`refreshes the footer immediately after ${reason} compaction`, async () => {
      const harness = createHarness();
      await harness.emit("session_start");
      await harness.emit("before_agent_start", {
        systemPrompt: "s".repeat(40),
        systemPromptOptions: {},
      });
      const oldMessage = { role: "user" as const, content: "x".repeat(200_000), timestamp: 0 };
      harness.sessionManager.appendMessage(oldMessage);
      await harness.emit("context", { messages: [oldMessage] });
      await harness.emit("agent_end");
      assert.match(harness.render(), /190\.0k of 200\.0k/);

      const keptId = harness.sessionManager.appendMessage({ role: "user", content: "kept", timestamp: 0 });
      const compactionId = harness.sessionManager.appendCompaction("c".repeat(800), keptId, 190_000);
      harness.setUsage({ tokens: null, contextWindow: 200_000, percent: null });
      const requestsBefore = harness.renderRequests;
      await harness.emit("session_compact", {
        compactionEntry: harness.sessionManager.getEntry(compactionId),
        fromExtension: false,
        reason,
        willRetry: reason === "overflow",
      });

      const messages = harness.sessionManager.buildSessionContext().messages;
      const messageTokens = convertToLlm(messages).reduce(
        (sum, message) => sum + estimateTokens(messageText(message)), 0,
      );
      const output = harness.render();
      assert.match(output, new RegExp(`${messageTokens + 10} of 200\\.0k`));
      assert.match(output, new RegExp(`messages ${messageTokens} `));
      assert.match(output, /system prompt 10 /);
      assert.doesNotMatch(output, /190\.0k of/);
      assert.ok(harness.renderRequests > requestsBefore);

      // Overflow recovery can request context again before fresh usage exists.
      await harness.emit("context", { messages });
      assert.match(harness.render(), new RegExp(`${messageTokens + 10} of 200\\.0k`));

      // A post-compaction response replaces the fallback with reported usage.
      harness.setUsage({ tokens: 1_200, contextWindow: 200_000, percent: 0.6 });
      await harness.emit("message_end");
      assert.match(harness.render(), /1\.2k of 200\.0k/);
    });
  }
});
