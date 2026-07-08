import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializeSingleAnswer,
  serializeMultiAnswer,
  buildResult,
} from "../extensions/result.js";
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
    annotations: {},
    answered: false,
    ...overrides,
  };
}

// ─── Single-select tests ────────────────────────────────────────────────────────

describe("serializeSingleAnswer", () => {
  it("returns undefined when nothing selected", () => {
    const q = makeQuestion();
    const state = makeState();
    assert.strictEqual(serializeSingleAnswer(q, state), undefined);
  });

  it("serializes built-in single-select answer with optionId", () => {
    const q = makeQuestion();
    const state = makeState({ selectedOptionId: "opt1" });
    const result = serializeSingleAnswer(q, state);
    assert.deepStrictEqual(result, {
      kind: "single",
      optionId: "opt1",
      label: "React",
    });
  });

  it("serializes Other... single-select answer", () => {
    const q = makeQuestion();
    const state = makeState({
      otherInputMode: true,
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

  it("prioritizes Other... over built-in selection", () => {
    const q = makeQuestion();
    const state = makeState({
      selectedOptionId: "opt1",
      otherInputMode: true,
      otherText: "Svelte",
    });
    const result = serializeSingleAnswer(q, state);
    assert.deepStrictEqual(result, {
      kind: "single",
      label: "Other...",
      other: true,
      text: "Svelte",
    });
  });
});

// ─── Multi-select tests ─────────────────────────────────────────────────────────

describe("serializeMultiAnswer", () => {
  it("serializes empty multi-select with empty flag", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({ multiSelections: new Set() });
    const result = serializeMultiAnswer(q, state, true);
    assert.deepStrictEqual(result, {
      kind: "multi",
      selections: [],
      empty: true,
    });
  });

  it("serializes multi-select with one built-in option", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({ multiSelections: new Set(["opt1"]) });
    const result = serializeMultiAnswer(q, state, false);
    assert.deepStrictEqual(result, {
      kind: "multi",
      selections: [{ optionId: "opt1", label: "React" }],
      empty: false,
    });
  });

  it("serializes multi-select with two built-in options", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({ multiSelections: new Set(["opt1", "opt2"]) });
    const result = serializeMultiAnswer(q, state, false);
    assert.deepStrictEqual(result, {
      kind: "multi",
      selections: [
        { optionId: "opt1", label: "React" },
        { optionId: "opt2", label: "Vue" },
      ],
      empty: false,
    });
  });

  it("serializes multi-select with built-in + Other...", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({
      multiSelections: new Set(["opt1"]),
      otherText: "Custom",
    });
    const result = serializeMultiAnswer(q, state, false);
    assert.deepStrictEqual(result, {
      kind: "multi",
      selections: [
        { optionId: "opt1", label: "React" },
        { label: "Other...", other: true, text: "Custom" },
      ],
      empty: false,
    });
  });

  it("multi-select with selections does not set empty flag", () => {
    const q = makeQuestion({ multiSelect: true });
    const state = makeState({ multiSelections: new Set(["opt1"]) });
    const result = serializeMultiAnswer(q, state, false);
    assert.strictEqual(result.empty, false);
  });
});

// ─── buildResult tests ──────────────────────────────────────────────────────────

describe("buildResult", () => {
  it("returns cancelled result when cancelled is true", () => {
    const q = makeQuestion();
    const states = new Map([["q1", makeState()]]);
    const result = buildResult([q], states, true);
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(result.answers, undefined);
    assert.strictEqual(result.annotations, undefined);
  });

  it("returns structured answers keyed by question.id", () => {
    const q = makeQuestion();
    const states = new Map([["q1", makeState({ selectedOptionId: "opt1" })]]);
    const result = buildResult([q], states, false);
    assert.strictEqual(result.cancelled, false);
    assert.ok(result.answers);
    assert.ok(result.answers["q1"]);
    assert.strictEqual(result.answers["q1"].kind, "single");
    assert.strictEqual(result.answers["q1"].optionId, "opt1");
  });

  it("includes annotations keyed by question.id", () => {
    const q = makeQuestion();
    const states = new Map([["q1", makeState({ annotations: { questionNotes: "hello" } })]]);
    const result = buildResult([q], states, false);
    assert.ok(result.annotations);
    assert.ok(result.annotations["q1"]);
    assert.strictEqual(result.annotations["q1"].questionNotes, "hello");
  });

  it("includes metadata when provided", () => {
    const q = makeQuestion();
    const states = new Map([["q1", makeState()]]);
    const result = buildResult([q], states, true, { source: "test", flowId: "f1" });
    assert.deepStrictEqual(result.metadata, { source: "test", flowId: "f1" });
  });
});
