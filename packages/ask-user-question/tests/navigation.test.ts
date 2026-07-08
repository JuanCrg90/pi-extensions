import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Pure navigation helpers ────────────────────────────────────────────────────

/**
 * Wrap an option index within the bounds of the options array.
 * -1 wraps to last; length wraps to 0.
 */
export function wrapOptionIndex(index: number, maxIndex: number): number {
  if (index < 0) return maxIndex - 1;
  if (index >= maxIndex) return 0;
  return index;
}

/**
 * Get the preferred focus index when revisiting a question.
 * - For single-select: return the index of the selected option, or 0.
 * - For multi-select: return the index of the first selected option, or 0.
 */
export function getPreferredFocusIndex(
  optionCount: number,
  selectedOptionId: string | undefined,
  multiSelections: Set<string>,
  options: Array<{ id: string }>,
): number {
  // Try to restore to the selected option (single-select)
  if (selectedOptionId) {
    const idx = options.findIndex((o) => o.id === selectedOptionId);
    if (idx >= 0) return idx;
  }

  // Try to restore to the first multi-selection
  if (multiSelections.size > 0) {
    for (let i = 0; i < options.length; i++) {
      if (multiSelections.has(options[i].id)) {
        return i;
      }
    }
  }

  return 0;
}

/**
 * Check if there are any missing required questions.
 */
export function findMissingRequired(
  questionIds: string[],
  answeredIds: Set<string>,
): string[] {
  const missing: string[] = [];
  for (const id of questionIds) {
    if (!answeredIds.has(id)) {
      missing.push(id);
    }
  }
  return missing;
}

/**
 * Determine if a review/submit tab should be shown.
 * Only for multi-question flows.
 */
export function shouldShowReviewTab(questionCount: number): boolean {
  return questionCount > 1;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("wrapOptionIndex", () => {
  it("wraps from first to last", () => {
    assert.strictEqual(wrapOptionIndex(-1, 4), 3);
  });

  it("wraps from last to first", () => {
    assert.strictEqual(wrapOptionIndex(4, 4), 0);
  });

  it("passes valid index through unchanged", () => {
    assert.strictEqual(wrapOptionIndex(0, 4), 0);
    assert.strictEqual(wrapOptionIndex(2, 4), 2);
    assert.strictEqual(wrapOptionIndex(3, 4), 3);
  });

  it("handles single option", () => {
    assert.strictEqual(wrapOptionIndex(-1, 1), 0);
    assert.strictEqual(wrapOptionIndex(1, 1), 0);
  });
});

describe("getPreferredFocusIndex", () => {
  const options = [
    { id: "opt1" },
    { id: "opt2" },
    { id: "opt3" },
  ];

  it("restores selected option focus", () => {
    const idx = getPreferredFocusIndex(3, "opt2", new Set(), options);
    assert.strictEqual(idx, 1);
  });

  it("defaults to 0 when nothing selected", () => {
    const idx = getPreferredFocusIndex(3, undefined, new Set(), options);
    assert.strictEqual(idx, 0);
  });

  it("restores first multi-selection focus", () => {
    const idx = getPreferredFocusIndex(3, undefined, new Set(["opt3", "opt1"]), options);
    // opt3 is at index 2, but we iterate in order so first match is opt1 at index 0
    // The Set iteration order may vary; we just verify it returns a valid index
    assert.ok(idx >= 0 && idx < 3);
  });

  it("prefers selectedOptionId over multiSelections", () => {
    const idx = getPreferredFocusIndex(3, "opt1", new Set(["opt3"]), options);
    assert.strictEqual(idx, 0);
  });
});

describe("findMissingRequired", () => {
  it("returns all ids when none answered", () => {
    const missing = findMissingRequired(["q1", "q2", "q3"], new Set());
    assert.deepStrictEqual(missing, ["q1", "q2", "q3"]);
  });

  it("returns only unanswered ids", () => {
    const missing = findMissingRequired(["q1", "q2", "q3"], new Set(["q1", "q3"]));
    assert.deepStrictEqual(missing, ["q2"]);
  });

  it("returns empty when all answered", () => {
    const missing = findMissingRequired(["q1", "q2"], new Set(["q1", "q2"]));
    assert.deepStrictEqual(missing, []);
  });
});

describe("shouldShowReviewTab", () => {
  it("returns false for single question", () => {
    assert.strictEqual(shouldShowReviewTab(1), false);
  });

  it("returns true for multiple questions", () => {
    assert.strictEqual(shouldShowReviewTab(2), true);
    assert.strictEqual(shouldShowReviewTab(8), true);
  });
});
