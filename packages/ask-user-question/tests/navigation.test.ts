import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  wrapOptionIndex,
  getPreferredFocusIndex,
  findMissingRequired,
  shouldShowReviewTab,
} from "../extensions/index.js";

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
    { id: "__other__" },
  ];

  it("restores selected option focus", () => {
    const idx = getPreferredFocusIndex(4, "opt2", new Set(), options);
    assert.strictEqual(idx, 1);
  });

  it("defaults to 0 when nothing selected", () => {
    const idx = getPreferredFocusIndex(4, undefined, new Set(), options);
    assert.strictEqual(idx, 0);
  });

  it("restores first multi-selection focus", () => {
    const idx = getPreferredFocusIndex(4, undefined, new Set(["opt3", "opt1"]), options);
    assert.strictEqual(idx, 0);
  });

  it("prefers selectedOptionId over multiSelections", () => {
    const idx = getPreferredFocusIndex(4, "opt1", new Set(["opt3"]), options);
    assert.strictEqual(idx, 0);
  });

  it("restores focus to Other... for single-select", () => {
    const idx = getPreferredFocusIndex(4, "__other__", new Set(), options);
    assert.strictEqual(idx, 3);
  });

  it("restores focus to Other... for multi-select", () => {
    const idx = getPreferredFocusIndex(4, undefined, new Set(["__other__"]), options);
    assert.strictEqual(idx, 3);
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
