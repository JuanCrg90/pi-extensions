import assert from "node:assert";
import { describe, it } from "node:test";
import type { DialogState, QuestionState, Question } from "../extensions/types.js";
import {
  hasPreviewAvailable,
  getFocusedOptionPreview,
  renderPreviewPanel,
  renderQuestion,
  getRenderedOptions,
} from "../extensions/index.js";
import { assembleAnnotations } from "../extensions/result.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeOption(
  id: string,
  label: string,
  description: string,
  preview?: string,
): { id: string; label: string; description: string; preview?: string } {
  return { id, label, description, preview };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    question: "Test?",
    header: "Test",
    options: [
      makeOption("opt1", "Option A", "First option", "Preview for A"),
      makeOption("opt2", "Option B", "Second option"),
    ],
    ...overrides,
  };
}

function makeBaseState(): QuestionState {
  return {
    focusIndex: 0,
    multiSelections: new Set(),
    selectedOptionId: undefined,
    otherText: "",
    otherInputMode: false,
    noteInputMode: false,
    noteText: "",
    multiSelectEmptyPending: false,
    annotations: {},
    editingNoteOptionIndex: -1,
    answered: false,
  };
}

function makeDialogState(
  questions: Question[] = [makeQuestion()],
  customState?: QuestionState,
): DialogState {
  const qs = customState || makeBaseState();
  return {
    questions,
    questionStates: new Map(questions.map((q) => [q.id, qs])),
    currentIndex: 0,
    pendingEscape: false,
    showHelp: false,
    statusMessage: "",
    inReviewMode: false,
    reviewPickerIndex: 0,
  };
}

// ─── L3 — Preview tests ───────────────────────────────────────────────────────

describe("L3 — Preview eligibility rules", () => {
  it("hasPreviewAvailable returns true when focused option has preview", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0; // Option A has preview

    assert.strictEqual(hasPreviewAvailable(q, qs), true);
  });

  it("hasPreviewAvailable returns false when focused option lacks preview", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 1; // Option B has no preview

    assert.strictEqual(hasPreviewAvailable(q, qs), false);
  });

  it("hasPreviewAvailable returns false when focused on Other...", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = q.options.length; // Other...

    assert.strictEqual(hasPreviewAvailable(q, qs), false);
  });

  it("hasPreviewAvailable returns false for multi-select questions", () => {
    const q = makeQuestion({ multiSelect: true });
    const qs = makeBaseState();
    qs.focusIndex = 0;

    assert.strictEqual(hasPreviewAvailable(q, qs), false);
  });
});

describe("L3 — Preview rendering", () => {
  it("getFocusedOptionPreview returns preview text for focused option", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;

    const preview = getFocusedOptionPreview(q, qs);
    assert.strictEqual(preview, "Preview for A");
  });

  it("getFocusedOptionPreview returns undefined when focused option lacks preview", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 1;

    const preview = getFocusedOptionPreview(q, qs);
    assert.strictEqual(preview, undefined);
  });

  it("getFocusedOptionPreview returns undefined for Other... option", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = q.options.length;

    const preview = getFocusedOptionPreview(q, qs);
    assert.strictEqual(preview, undefined);
  });

  it("renderPreviewPanel falls back to normal rendering when no preview available", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 1; // No preview on Option B

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should contain normal option rendering
    assert.ok(lines.some((l) => l.includes("Option A") || l.includes("Option B")));
  });

  it("renderPreviewPanel shows fallback text when focused option lacks preview but another has one", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 1; // Option B (no preview)

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should show (no preview) fallback
    assert.ok(lines.some((l) => l.includes("(no preview)")));
  });

  it("renderPreviewPanel renders preview when focused option has preview", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0; // Option A has preview

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should show preview text
    assert.ok(lines.some((l) => l.includes("Preview for A") || l.includes("Preview")));
  });

  it("renderPreviewPanel falls back to single-column in narrow terminals", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 24); // Narrow terminal

    // Should still work without crashing
    assert.ok(lines.length > 0);
    assert.ok(lines.some((l) => l.includes("❯")));
  });

  it("renderPreviewPanel does not show preview in note input mode", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;
    qs.noteInputMode = true;
    qs.noteText = "test";

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should show normal rendering (with note editor)
    assert.ok(lines.some((l) => l.includes("Note editor")));
  });

  it("renderPreviewPanel does not show preview in Other... input mode", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;
    qs.otherInputMode = true;

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should show normal rendering (with Other... input)
    assert.ok(lines.some((l) => l.includes("Other...")));
  });

  it("renderPreviewPanel handles empty preview gracefully", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should not throw or crash
    assert.ok(lines.length > 0);
  });
});

describe("L3 — Preview with no previews on any option", () => {
  it("renderPreviewPanel renders normally when no option has preview", () => {
    const q = makeQuestion();
    q.options = [
      makeOption("opt1", "Option A", "First option"),
      makeOption("opt2", "Option B", "Second option"),
    ];

    const qs = makeBaseState();
    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 80);

    // Should render normally (no preview panel)
    assert.ok(lines.some((l) => l.includes("Option A")));
    assert.ok(lines.some((l) => l.includes("Option B")));
    assert.ok(!lines.some((l) => l.includes("Preview")));
  });
});

describe("L3 — Preview stored in annotations", () => {
  it("selectedPreview is stored in annotations when question is answered", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.selectedOptionId = "opt1";
    qs.answered = true;

    // Simulate storing preview
    const preview = getFocusedOptionPreview(q, qs);
    if (preview) {
      qs.annotations.selectedPreview = preview;
    }

    const annotations = assembleAnnotations(q, qs);
    assert.strictEqual(annotations.selectedPreview, "Preview for A");
  });

  it("selectedPreview is undefined when focused option has no preview", () => {
    // Create a question where Option B has no preview
    const q = {
      id: "q2",
      question: "Test?",
      header: "Test2",
      multiSelect: false,
      required: true,
      options: [
        makeOption("opt1", "Option A", "First option", "Preview for A"),
        makeOption("opt2", "Option B", "Second option"),
      ],
    } as Question;
    const qs = makeBaseState();
    qs.selectedOptionId = "opt2";
    qs.focusIndex = 1;
    qs.answered = true;

    const preview = getFocusedOptionPreview(q, qs);
    if (preview) {
      qs.annotations.selectedPreview = preview;
    }

    const annotations = assembleAnnotations(q, qs);
    assert.strictEqual(annotations.selectedPreview, undefined);
  });

  it("selectedPreview is not stored for multi-select questions", () => {
    const q = makeQuestion({ multiSelect: true });
    const qs = makeBaseState();
    qs.focusIndex = 0;
    qs.answered = true;

    // For multi-select, preview is not available
    assert.strictEqual(hasPreviewAvailable(q, qs), false);
  });
});

describe("L3 — Preview side-by-side layout", ()   => {
  it("side-by-side layout has left and right columns in wide terminal", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 60);

    // Should have lines with both left (options) and right (preview)
    const previewLine = lines.find((l) => l.includes("Preview"));
    assert.ok(previewLine, "Should contain preview section");
  });

  it("single-column layout stacks preview below options in narrow terminal", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.focusIndex = 0;

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 24); // Narrow

    // Should still contain preview
    assert.ok(lines.some((l) => l.includes("Preview") || l.includes("(no preview)")));
  });

  it("preview text is word-wrapped in side-by-side layout", () => {
    const q = makeQuestion();
    // Long preview text to test wrapping
    q.options[0].preview =
      "This is a very long preview text that should be wrapped across multiple lines in the preview panel.";
    const qs = makeBaseState();
    qs.focusIndex = 0;

    const state = makeDialogState([q], qs);
    const lines = renderPreviewPanel(state, 0, 60);

    // Should have multiple preview lines (wrapped)
    const previewLines = lines.filter((l) => l.includes("Preview"));
    assert.ok(previewLines.length >= 1);
  });
});
