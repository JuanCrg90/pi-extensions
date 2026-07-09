import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderTabs,
  renderReviewTab,
  getMissingRequired,
} from "../extensions/render.js";
import { shouldShowReviewTab } from "../extensions/state.js";
import type { DialogState, Question, QuestionState } from "../extensions/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeQuestion(overrides?: Partial<Question>): Question {
  return {
    id: "q1",
    question: "Pick one?",
    header: "Pick",
    options: [
      { id: "opt1", label: "React", description: "UI library" },
      { id: "opt2", label: "Vue", description: "Framework" },
    ],
    ...overrides,
  };
}

function makeDialogState(overrides?: Partial<DialogState>): DialogState {
  const q1 = makeQuestion();
  const q2 = makeQuestion({ id: "q2", question: "Choose?", header: "Choose" });
  const qs1: QuestionState = {
    focusIndex: 0,
    multiSelections: new Set(),
    selectedOptionId: undefined,
    otherText: "",
    otherInputMode: false,
    multiSelectEmptyPending: false,
    annotations: {},
    answered: false,
  };
  const qs2: QuestionState = { ...qs1 };
  const qStates = new Map<string, QuestionState>();
  qStates.set(q1.id, qs1);
  qStates.set(q2.id, qs2);

  return {
    questions: [q1, q2],
    questionStates: qStates,
    currentIndex: 0,
    pendingEscape: false,
    showHelp: false,
    statusMessage: "",
    inReviewMode: false,
    reviewPickerIndex: 0,
    ...overrides,
  };
}

// ─── J3: Review tab present/absent ──────────────────────────────────────────────

describe("J3 — Review tab present/absent", () => {
  it("submit tab absent for one question", () => {
    assert.strictEqual(shouldShowReviewTab(1), false);
  });

  it("submit tab present for multiple questions", () => {
    assert.strictEqual(shouldShowReviewTab(2), true);
    assert.strictEqual(shouldShowReviewTab(8), true);
  });

  it("renderTabs includes question chips", () => {
    const q1 = makeQuestion();
    const q2 = makeQuestion({ id: "q2", question: "Choose?", header: "Choose" });
    const qs: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: undefined,
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: false,
    };
    const qStates = new Map([["q1", { ...qs }], ["q2", { ...qs }]]);
    const state: DialogState = {
      questions: [q1, q2],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
    const tabs = renderTabs(state, 0);
    assert.ok(tabs.some((t) => t.includes(q1.header)));
    assert.ok(tabs.some((t) => t.includes(q2.header)));
  });
});

// ─── J3: Missing required questions block submit ────────────────────────────────

describe("J3 — Missing required questions block submit", () => {
  it("returns all headers when none answered", () => {
    const q1 = makeQuestion({ id: "q1", header: "Q1" });
    const q2 = makeQuestion({ id: "q2", header: "Q2" });
    const qStates = new Map([
      ["q1", { answered: false } as QuestionState],
      ["q2", { answered: false } as QuestionState],
    ]);
    const missing = getMissingRequired([q1, q2], qStates);
    assert.deepStrictEqual(missing, ["Q1", "Q2"]);
  });

  it("returns only unanswered headers", () => {
    const q1 = makeQuestion({ id: "q1", header: "Q1" });
    const q2 = makeQuestion({ id: "q2", header: "Q2" });
    const qStates = new Map([
      ["q1", { answered: true } as QuestionState],
      ["q2", { answered: false } as QuestionState],
    ]);
    const missing = getMissingRequired([q1, q2], qStates);
    assert.deepStrictEqual(missing, ["Q2"]);
  });

  it("returns empty when all answered", () => {
    const q1 = makeQuestion({ id: "q1", header: "Q1" });
    const q2 = makeQuestion({ id: "q2", header: "Q2" });
    const qStates = new Map([
      ["q1", { answered: true } as QuestionState],
      ["q2", { answered: true } as QuestionState],
    ]);
    const missing = getMissingRequired([q1, q2], qStates);
    assert.deepStrictEqual(missing, []);
  });

  it("renderReviewTab shows missing warnings", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const q2 = makeQuestion({ id: "q2", header: "Choose" });
    const qs = { answered: false } as QuestionState;
    const qStates = new Map([["q1", qs], ["q2", qs]]);
    const state: DialogState = {
      questions: [q1, q2],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: true,
      reviewPickerIndex: 0,
    };
    const lines = renderReviewTab(state);
    assert.ok(lines.some((l) => l.includes("⚠ Missing:")));
    assert.ok(lines.some((l) => l.includes("Pick")));
    assert.ok(lines.some((l) => l.includes("Choose")));
  });

  it("renderReviewTab shows all-answered confirmation", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const q2 = makeQuestion({ id: "q2", header: "Choose" });
    const qs = { answered: true } as QuestionState;
    const qStates = new Map([["q1", qs], ["q2", qs]]);
    const state: DialogState = {
      questions: [q1, q2],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: true,
      reviewPickerIndex: 0,
    };
    const lines = renderReviewTab(state);
    assert.ok(lines.some((l) => l.includes("All questions answered")));
  });
});

// ─── J3: Review tab rendering ──────────────────────────────────────────────────

describe("J3 — Review tab rendering", () => {
  it("renderReviewTab includes header line", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const qs: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qStates = new Map([["q1", qs]]);
    const state: DialogState = {
      questions: [q1],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: true,
      reviewPickerIndex: 0,
    };
    const lines = renderReviewTab(state);
    assert.ok(lines.some((l) => l.includes("Pick: React")));
    assert.ok(lines.some((l) => l.includes("━━━ Review Answers ━━━")));
  });

  it("renderReviewTab shows submit/cancel picker", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const qs: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qStates = new Map([["q1", qs]]);
    const state: DialogState = {
      questions: [q1],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: true,
      reviewPickerIndex: 0,
    };
    const lines = renderReviewTab(state);
    assert.ok(lines.some((l) => l.includes("(•) Submit answers")));
    assert.ok(lines.some((l) => l.includes("( ) Cancel")));
  });

  it("renderReviewTab shows picker with cancel focused", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const qs: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qStates = new Map([["q1", qs]]);
    const state: DialogState = {
      questions: [q1],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: true,
      reviewPickerIndex: 1,
    };
    const lines = renderReviewTab(state);
    assert.ok(lines.some((l) => l.includes("( ) Submit answers")));
    assert.ok(lines.some((l) => l.includes("(•) Cancel")));
  });
});

// ─── J3: Tab bar rendering ──────────────────────────────────────────────────────

describe("J3 — Tab bar rendering", () => {
  it("shows active question with arrow", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const qs = { answered: false } as QuestionState;
    const qStates = new Map([["q1", qs]]);
    const state: DialogState = {
      questions: [q1],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
    const tabs = renderTabs(state, 0);
    assert.ok(tabs.some((t) => t.includes("▸ Pick")));
  });

 it("shows answered question with checkmark when not active", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const q2 = makeQuestion({ id: "q2", header: "Choose" });
    const qs1: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qs2: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: undefined,
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: false,
    };
    const qStates = new Map([["q1", qs1], ["q2", qs2]]);
    const state: DialogState = {
      questions: [q1, q2],
      questionStates: qStates,
      currentIndex: 1,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
    const tabs = renderTabs(state, 0);
    // q1 is answered and not active → checkmark
    assert.ok(tabs.some((t) => t.includes("✓ Pick")));
    // q2 is active and unanswered → arrow
    assert.ok(tabs.some((t) => t.includes("▸ Choose")));
  });

  it("shows unanswered question with circle when not active", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const q2 = makeQuestion({ id: "q2", header: "Choose" });
    const qs1: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: undefined,
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: false,
    };
    const qs2: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qStates = new Map([["q1", qs1], ["q2", qs2]]);
    const state: DialogState = {
      questions: [q1, q2],
      questionStates: qStates,
      currentIndex: 1,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
    const tabs = renderTabs(state, 0);
    // q1 is unanswered and not active → circle
    assert.ok(tabs.some((t) => t.includes("○ Pick")));
    // q2 is active → arrow
    assert.ok(tabs.some((t) => t.includes("▸ Choose")));
  });
});

// ─── J3: Submit/cancel chip in review mode ─────────────────────────────────────

describe("J3 — Submit/cancel chip in review mode", () => {
  it("renderTabs includes submit/cancel when inReviewMode", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const q2 = makeQuestion({ id: "q2", header: "Choose" });
    const qs1: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qs2: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qStates = new Map([["q1", qs1], ["q2", qs2]]);
    const state: DialogState = {
      questions: [q1, q2],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: true,
      reviewPickerIndex: 0,
    };
    const tabs = renderTabs(state, 0);
    assert.ok(tabs.some((t) => t.includes("submit")));
    assert.ok(tabs.some((t) => t.includes("cancel")));
    assert.ok(tabs.some((t) => t.includes("(•)")));
  });

  it("review tab absent for single question flow", () => {
    const q1 = makeQuestion({ id: "q1", header: "Pick" });
    const qs1: QuestionState = {
      focusIndex: 0,
      multiSelections: new Set(),
      selectedOptionId: "opt1",
      otherText: "",
      otherInputMode: false,
      multiSelectEmptyPending: false,
      annotations: {},
      answered: true,
    };
    const qStates = new Map([["q1", qs1]]);
    const state: DialogState = {
      questions: [q1],
      questionStates: qStates,
      currentIndex: 0,
      pendingEscape: false,
      showHelp: false,
      statusMessage: "",
      inReviewMode: false,
      reviewPickerIndex: 0,
    };
    const tabs = renderTabs(state, 0);
    // Single question: no submit/cancel chip
    assert.ok(!tabs.some((t) => t.includes("submit")));
    assert.ok(!tabs.some((t) => t.includes("cancel")));
  });
});
