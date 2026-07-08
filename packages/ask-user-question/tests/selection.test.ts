import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializeMultiAnswer,
} from "../extensions/result.js";
import type { QuestionState } from "../extensions/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeMultiSelectState(
  options: { id: string }[],
  overrides?: Partial<QuestionState>,
): QuestionState {
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

// ─── Selection toggle helpers ───────────────────────────────────────────────────

/**
 * Toggle selection for the focused option.
 * This mirrors what the dialog does on Space key.
 */
function toggleSelection(
  state: QuestionState,
  focusIndex: number,
  options: Array<{ id: string }>,
): void {
  const opt = options[focusIndex];
  if (state.multiSelections.has(opt.id)) {
    state.multiSelections.delete(opt.id);
  } else {
    state.multiSelections.add(opt.id);
  }
  state.multiSelectEmptyPending = false;
}

/**
 * Confirm the current answer by pressing Enter.
 * Mirrors the Enter key handler for multi-select.
 */
function confirmMultiSelect(
  state: QuestionState,
  emptyPending: boolean,
): { confirmed: boolean; answerKind: "answered" | "empty_pending" } {
  if (state.multiSelections.size === 0) {
    if (emptyPending) {
      state.answered = true;
      return { confirmed: true, answerKind: "answered" };
    } else {
      state.multiSelectEmptyPending = true;
      return { confirmed: false, answerKind: "empty_pending" };
    }
  } else {
    state.answered = true;
    return { confirmed: true, answerKind: "answered" };
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("multi-select selection", () => {
  const options = [
    { id: "opt1", label: "React" },
    { id: "opt2", label: "Vue" },
    { id: "opt3", label: "Svelte" },
  ];

  it("selecting one option", () => {
    const state = makeMultiSelectState(options);
    toggleSelection(state, 0, options);
    assert.strictEqual(state.multiSelections.size, 1);
    assert.ok(state.multiSelections.has("opt1"));
  });

  it("selecting two options", () => {
    const state = makeMultiSelectState(options);
    toggleSelection(state, 0, options);
    toggleSelection(state, 1, options);
    assert.strictEqual(state.multiSelections.size, 2);
    assert.ok(state.multiSelections.has("opt1"));
    assert.ok(state.multiSelections.has("opt2"));
  });

  it("deselecting one option", () => {
    const state = makeMultiSelectState(options, {
      multiSelections: new Set(["opt1", "opt2"]),
    });
    // Focus on opt2 and deselect
    const opt = options[1];
    state.multiSelections.delete(opt.id);
    assert.strictEqual(state.multiSelections.size, 1);
    assert.ok(state.multiSelections.has("opt1"));
    assert.ok(!state.multiSelections.has("opt2"));
  });

  it("deselecting all options clears temporary answer record", () => {
    const state = makeMultiSelectState(options, {
      multiSelections: new Set(["opt1", "opt2"]),
    });
    // Deselect opt1
    state.multiSelections.delete("opt1");
    // Deselect opt2
    state.multiSelections.delete("opt2");
    assert.strictEqual(state.multiSelections.size, 0);
  });

  it("pressing Enter with no selections requires confirmation", () => {
    const state = makeMultiSelectState(options);
    const result = confirmMultiSelect(state, false);
    assert.strictEqual(result.confirmed, false);
    assert.strictEqual(result.answerKind, "empty_pending");
    assert.ok(state.multiSelectEmptyPending);
    assert.ok(!state.answered);
  });

  it("explicit empty answer is serialized correctly", () => {
    const state = makeMultiSelectState(options, {
      multiSelections: new Set(),
      multiSelectEmptyPending: true,
    });
    const result = serializeMultiAnswer(
      { id: "q1", question: "Pick?", header: "Pick", options: [], multiSelect: true },
      state,
      true,
    );
    assert.strictEqual(result.kind, "multi");
    assert.strictEqual(result.selections.length, 0);
    assert.strictEqual(result.empty, true);
  });

  it("explicit empty answer is not flagged when not confirmed", () => {
    const state = makeMultiSelectState(options, {
      multiSelections: new Set(),
      multiSelectEmptyPending: false,
    });
    const result = serializeMultiAnswer(
      { id: "q1", question: "Pick?", header: "Pick", options: [], multiSelect: true },
      state,
      false,
    );
    assert.strictEqual(result.kind, "multi");
    assert.strictEqual(result.selections.length, 0);
    assert.strictEqual(result.empty, false);
  });

  it("Enter with selections confirms immediately", () => {
    const state = makeMultiSelectState(options, {
      multiSelections: new Set(["opt1", "opt2"]),
    });
    const result = confirmMultiSelect(state, false);
    assert.strictEqual(result.confirmed, true);
    assert.strictEqual(result.answerKind, "answered");
    assert.ok(state.answered);
  });

  it("second Enter after pending confirms empty", () => {
    const state = makeMultiSelectState(options);
    // First Enter
    let result = confirmMultiSelect(state, false);
    assert.strictEqual(result.confirmed, false);
    assert.strictEqual(result.answerKind, "empty_pending");

    // Second Enter
    result = confirmMultiSelect(state, true);
    assert.strictEqual(result.confirmed, true);
    assert.strictEqual(result.answerKind, "answered");
    assert.ok(state.answered);
  });
});

describe("multi-select serialization with other...", () => {
  it("multi-select with built-in + Other...", () => {
    const q = {
      id: "q1",
      question: "Pick?",
      header: "Pick",
      options: [
        { id: "opt1", label: "React", description: "UI library" },
        { id: "opt2", label: "Vue", description: "Framework" },
      ],
      multiSelect: true,
    };
    const state: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(["opt1"]),
      selectedOptionId: undefined,
      otherText: "Custom answer",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const result = serializeMultiAnswer(q, state, false);
    assert.strictEqual(result.kind, "multi");
    assert.strictEqual(result.selections.length, 2);
    assert.strictEqual(result.selections[0].optionId, "opt1");
    assert.strictEqual(result.selections[0].other, undefined);
    assert.strictEqual(result.selections[1].other, true);
    assert.strictEqual(result.selections[1].text, "Custom answer");
  });
});
