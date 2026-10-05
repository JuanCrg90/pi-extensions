import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  parseSystemPromptSections,
  categorizeSections,
  messageText,
  formatTokens,
  formatPercent,
  scaleCategories,
  CHARS_PER_TOKEN,
} from "../src/context.ts";

describe("estimateTokens", () => {
  it("rounds up to whole tokens", () => {
    assert.strictEqual(estimateTokens("a".repeat(CHARS_PER_TOKEN - 1)), 1);
    assert.strictEqual(estimateTokens("a".repeat(CHARS_PER_TOKEN)), 1);
    assert.strictEqual(estimateTokens("a".repeat(CHARS_PER_TOKEN + 1)), 2);
  });

  it("treats empty text as zero", () => {
    assert.strictEqual(estimateTokens(""), 0);
  });
});

describe("parseSystemPromptSections", () => {
  it("extracts the preamble and tagged sections", () => {
    const prompt = [
      "You are a helpful assistant.",
      "",
      "<tools>",
      "- read: reads files",
      "</tools>",
      "<rules>",
      "- Be concise",
      "</rules>",
    ].join("\n");

    const sections = parseSystemPromptSections(prompt);

    assert.strictEqual(sections.preamble, "You are a helpful assistant.");
    assert.strictEqual(sections.tools, "- read: reads files");
    assert.strictEqual(sections.rules, "- Be concise");
  });

  it("uses the whole prompt as preamble when no tags exist", () => {
    const prompt = "Just a plain system prompt.";
    const sections = parseSystemPromptSections(prompt);
    assert.strictEqual(sections.preamble, prompt);
    assert.strictEqual(Object.keys(sections).length, 1);
  });
});

describe("categorizeSections", () => {
  it("buckets standard sections correctly", () => {
    const sections = {
      preamble: "p",
      rules: "r",
      docs: "d",
      cwd: "/tmp",
      tools: "t",
      skills: "s",
      project_context: "pc",
    };

    const cats = categorizeSections(sections);

    assert.ok(cats.systemPrompt && cats.systemPrompt > 0);
    assert.ok(cats.tools && cats.tools > 0);
    assert.ok(cats.skills && cats.skills > 0);
    assert.ok(cats.projectContext && cats.projectContext > 0);
  });

  it("folds custom sections into system prompt", () => {
    const cats = categorizeSections({ custom_block: "hello world" });
    assert.ok(cats.systemPrompt && cats.systemPrompt > 0);
  });
});

describe("messageText", () => {
  it("extracts string content", () => {
    assert.strictEqual(messageText({ role: "user", content: "hello" }), "hello");
  });

  it("extracts text parts from an array", () => {
    assert.strictEqual(
      messageText({
        role: "user",
        content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }],
      }),
      "hello world",
    );
  });

  it("extracts thinking and tool-call parts from assistant messages", () => {
    const text = messageText({
      role: "assistant",
      content: [
        { type: "text", text: "Let me check." },
        { type: "thinking", thinking: "<plan>" },
        { type: "toolCall", name: "read", arguments: { path: "x" } },
      ],
    });

    assert.ok(text.includes("Let me check."));
    assert.ok(text.includes("<plan>"));
    assert.ok(text.includes("read"));
    assert.ok(text.includes('"path":"x"'));
  });
});

describe("formatTokens", () => {
  it("formats small numbers as integers", () => {
    assert.strictEqual(formatTokens(500), "500");
  });

  it("formats thousands with one decimal", () => {
    assert.strictEqual(formatTokens(1500), "1.5k");
  });

  it("formats millions with two decimals", () => {
    assert.strictEqual(formatTokens(1_500_000), "1.50M");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent", () => {
    assert.strictEqual(formatPercent(0.123), "12%");
    assert.strictEqual(formatPercent(0.999), "100%");
  });

  it("clamps out-of-range values", () => {
    assert.strictEqual(formatPercent(-0.1), "0%");
    assert.strictEqual(formatPercent(1.5), "100%");
  });
});

describe("scaleCategories", () => {
  it("returns raw estimates when no reported total exists", () => {
    const categories = {
      systemPrompt: 10,
      tools: 20,
      mcpTools: 0,
      skills: 0,
      projectContext: 0,
      messages: 30,
    };

    const { used, categories: scaled } = scaleCategories(categories, null);

    assert.strictEqual(used, 60);
    assert.strictEqual(scaled.length, 3);
    assert.ok(scaled.some((c) => c.key === "systemPrompt" && c.tokens === 10));
  });

  it("scales categories to the reported total", () => {
    const categories = {
      systemPrompt: 10,
      tools: 10,
      mcpTools: 0,
      skills: 0,
      projectContext: 0,
      messages: 20,
    };

    const { used, categories: scaled } = scaleCategories(categories, 100);

    assert.strictEqual(used, 100);
    const total = scaled.reduce((sum, c) => sum + c.tokens, 0);
    assert.strictEqual(total, 100);
    const messages = scaled.find((c) => c.key === "messages");
    assert.strictEqual(messages!.tokens, 50);
  });

  it("drops zero categories", () => {
    const categories = {
      systemPrompt: 0,
      tools: 0,
      mcpTools: 0,
      skills: 0,
      projectContext: 0,
      messages: 10,
    };

    const { categories: scaled } = scaleCategories(categories, null);

    assert.strictEqual(scaled.length, 1);
    assert.strictEqual(scaled[0].key, "messages");
  });
});
