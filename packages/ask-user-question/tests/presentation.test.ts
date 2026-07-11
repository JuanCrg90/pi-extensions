import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCallSummary,
  buildContentText,
  buildResultSummary,
} from "../extensions/index.js";
import type { AskUserQuestionParams, AskUserQuestionResult } from "../extensions/types.js";

describe("buildCallSummary", () => {
  it("shows title, count, and headers", () => {
    const args: AskUserQuestionParams = {
      questions: [
        {
          id: "q1",
          question: "Pick one?",
          header: "Pick",
          options: [
            { id: "o1", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
        {
          id: "q2",
          question: "Choose one?",
          header: "Choose",
          options: [
            { id: "o1", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
      ],
    };

    assert.deepStrictEqual(buildCallSummary(args), [
      "AskUserQuestion",
      "2 questions",
      "Headers: Pick, Choose",
    ]);
  });
});

describe("buildContentText", () => {
  it("shows cancelled text clearly", () => {
    assert.strictEqual(
      buildContentText({ cancelled: true }),
      "User dismissed the question dialog.",
    );
  });

  it("shows single and multi answers", () => {
    const result: AskUserQuestionResult = {
      cancelled: false,
      answers: {
        q1: { kind: "single", optionId: "o1", label: "A" },
        q2: {
          kind: "multi",
          selections: [
            { optionId: "o1", label: "A" },
            { label: "Other...", other: true, text: "Custom" },
          ],
          empty: false,
        },
      },
    };

    const text = buildContentText(result);
    assert.ok(text.includes("q1: A"));
    assert.ok(text.includes("q2: [A, Other... (Other: Custom)]"));
  });
});

describe("buildResultSummary", () => {
  it("shows cancelled state", () => {
    assert.deepStrictEqual(buildResultSummary({ cancelled: true }), [
      "⚠ Question dialog dismissed",
    ]);
  });

  it("shows answers and annotation hint", () => {
    const result: AskUserQuestionResult = {
      cancelled: false,
      answers: {
        q1: { kind: "single", optionId: "o1", label: "A" },
        q2: { kind: "multi", selections: [], empty: true },
      },
      annotations: {
        q1: { selectedPreview: "preview text" },
      },
    };

    const lines = buildResultSummary(result);
    assert.ok(lines.includes("Question results:"));
    assert.ok(lines.includes("  q1: A"));
    assert.ok(lines.includes("  q2: (empty)"));
    assert.ok(lines.includes("  (annotations present — see details)"));
  });
});
