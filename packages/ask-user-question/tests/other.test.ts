import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializeSingleAnswer,
  serializeMultiAnswer,
  buildResult,
  getRenderedOptions,
} from "../extensions/index.js";
import type { Question, QuestionState } from "../extensions/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeQuestion(overrides?: Partial<Question>): Question {
  return {
    id: "q1",
    question: "Pick one?",
    header: "Pick",
    options: [
      { id: "opt1", label: "React", description: "UI library" },
      { id: "opt2", label: "Vue", description: "Progressive framework" },
    ],
    ...overrides,
  };
}

function makeState(overrides?: Partial<QuestionState>): QuestionState {
  return {
    focusIndex: 0,
    multiSelections: new Set<string>(),
    selectedOptionId: undefined,
    otherText: "",
    otherInputMode: false,
    multiSelectEmptyPending: false,
    annotations: {},
    answered: false,
    ...overrides,
  };
}

// ─── Single-select Other... tests ───────────────────────────────────────────────

describe("single-select Other...", () => {
  it("serializes Other... with other flag and text", () => {
    const q = makeQuestion();
    const state = makeState({
      otherInputMode: false,
      selectedOptionId: "__other__",
      otherText: "Angular",
    });
    const result = serializeSingleAnswer(q, state);
    assert.deepStrictEqual(result, {
      kind: "single",
      label: "Other...",
      other: true,
      text: "Angular",
    });
  });

  it("serializes Other... during input mode", () => {
    const q = makeQuestion();
    const state = makeState({
      otherInputMode: true,
      otherText: "Svelte",
    });
    const result = serializeSingleAnswer(q, state);
    assert.ok(result);
    assert.strictEqual(result!.kind, "single");
    assert.strictEqual(result!.other, true);
    assert.strictEqual(result!.text, "Svelte");
  });

  it("serializes Other... with trimmed text", () => {
    const q = makeQuestion();
    const state = makeState({
      otherInputMode: true,
      otherText: "  Custom  ",
    });
    const result = serializeSingleAnswer(q, state);
    assert.ok(result);
    assert.strictEqual(result!.text, "Custom");
  });

  it("returns undefined for empty Other... text", () => {
    const q = makeQuestion();
    const state = makeState({
      otherInputMode: true,
      otherText: "",
    });
    assert.strictEqual(serializeSingleAnswer(q, state), undefined);
  });

  it("prioritizes Other... over built-in selection when in input mode", () => {
    const q = makeQuestion();
    const state = makeState({
      selectedOptionId: "opt1",
      otherInputMode: true,
      otherText: "Custom",
    });
    const result = serializeSingleAnswer(q, state);
    assert.ok(result);
    assert.strictEqual(result!.kind, "single");
    assert.strictEqual(result!.other, true);
    assert.strictEqual(result!.optionId, undefined);
  });
});

// ─── Multi-select Other... tests ────────────────────────────────────────────────

describe("multi-select Other...", () => {
  it("serializes Other... only selection", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({
      multiSelections: new Set(["__other__"]),
      otherText: "Custom answer",
    });
    const result = serializeMultiAnswer(q, state, false);
    assert.strictEqual(result.kind, "multi");
    assert.strictEqual(result.selections.length, 1);
    assert.strictEqual(result.selections[0].label, "Other...");
    assert.strictEqual(result.selections[0].other, true);
    assert.strictEqual(result.selections[0].text, "Custom answer");
    assert.strictEqual(result.empty, false);
  });

  it("serializes built-in + Other... together", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({
      multiSelections: new Set(["opt1", "__other__"]),
      otherText: "Custom",
    });
    const result = serializeMultiAnswer(q, state, false);
    assert.strictEqual(result.kind, "multi");
    assert.strictEqual(result.selections.length, 2);
    assert.strictEqual(result.selections[0].optionId, "opt1");
    assert.strictEqual(result.selections[1].other, true);
    assert.strictEqual(result.selections[1].text, "Custom");
  });

  it("omits Other... when not in multiSelections", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({
      multiSelections: new Set(["opt1", "opt2"]),
      otherText: "",
    });
    const result = serializeMultiAnswer(q, state, false);
    assert.strictEqual(result.selections.length, 2);
    for (const s of result.selections) {
      assert.strictEqual(s.other, undefined);
    }
  });

  it("serializes Other... with trimmed text in multi-select", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({
      multiSelections: new Set(["__other__"]),
      otherText: "  Trimmed  ",
    });
    const result = serializeMultiAnswer(q, state, false);
    assert.strictEqual(result.selections[0].text, "Trimmed");
  });
});

// ─── buildResult with Other... ──────────────────────────────────────────────────

describe("buildResult with Other...", () => {
  it("serializes single-select Other... in full result", () => {
    const q = makeQuestion();
    const states = new Map([
      ["q1", makeState({
        selectedOptionId: "__other__",
        otherText: "Custom",
        answered: true,
      })],
    ]);
    const result = buildResult([q], states, false);
    assert.strictEqual(result.cancelled, false);
    assert.ok(result.answers);
    assert.strictEqual(result.answers!["q1"].kind, "single");
    assert.strictEqual(result.answers!["q1"].other, true);
    assert.strictEqual(result.answers!["q1"].text, "Custom");
  });

  it("serializes multi-select Other... in full result", () => {
    const q = makeQuestion({ multiSelect: true });
    const states = new Map([
      ["q1", makeState({
        multiSelections: new Set(["opt1", "__other__"]),
        otherText: "Custom",
        answered: true,
      })],
    ]);
    const result = buildResult([q], states, false);
    assert.strictEqual(result.answers!["q1"].kind, "multi");
    assert.strictEqual(result.answers!["q1"].selections.length, 2);
    assert.strictEqual(result.answers!["q1"].selections[1].other, true);
  });
});

// ─── getRenderedOptions (I1 — auto-inject) ─────────────────────────────────────

describe("getRenderedOptions auto-injection", () => {
  it("includes all built-in options", () => {
    const q = makeQuestion();
    const state = makeState();
    const rendered = getRenderedOptions(q, state);
    assert.strictEqual(rendered.length, 3); // 2 built-in + Other...
    assert.strictEqual(rendered[0].id, "opt1");
    assert.strictEqual(rendered[1].id, "opt2");
  });

  it("auto-injects Other... at the end", () => {
    const q = makeQuestion();
    const state = makeState();
    const rendered = getRenderedOptions(q, state);
    assert.strictEqual(rendered[2].label, "Other...");
    assert.strictEqual(rendered[2].isOther, true);
    assert.strictEqual(rendered[0].isOther, false);
    assert.strictEqual(rendered[1].isOther, false);
  });

  it("auto-injects Other... for multi-select questions", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState();
    const rendered = getRenderedOptions(q, state);
    assert.strictEqual(rendered.length, 3);
    assert.strictEqual(rendered[2].label, "Other...");
  });
});
