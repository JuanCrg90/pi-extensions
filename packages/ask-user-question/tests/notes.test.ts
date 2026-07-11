import assert from "node:assert";
import { describe, it } from "node:test";
import type { DialogState, QuestionState, Question, Option } from "../extensions/types.js";
import { buildResult, assembleAnnotations } from "../extensions/result.js";
import { initQuestionState } from "../extensions/state.js";
import { getRenderedOptions } from "../extensions/index.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeOption(id: string, label: string = "Option"): Option {
  return { id, label, description: `${label} description` };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    question: "Test?",
    header: "Test",
    options: [makeOption("opt1"), makeOption("opt2")],
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

// ─── K4: Note tests ────────────────────────────────────────────────────────────

describe("K4 — Note storage and editing", () => {
  it("initializes noteInputMode and editingNoteOptionIndex to false/-1", () => {
    const qs = makeBaseState();
    assert.strictEqual(qs.noteInputMode, false);
    assert.strictEqual(qs.editingNoteOptionIndex, -1);
    assert.strictEqual(qs.noteText, "");
  });

  it("initQuestionState initializes note fields", () => {
    const qs = initQuestionState(makeQuestion());
    assert.strictEqual(qs.noteInputMode, false);
    assert.strictEqual(qs.editingNoteOptionIndex, -1);
    assert.strictEqual(qs.noteText, "");
  });

  it("option notes are stored keyed by option id", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "My note";

    const annotations = assembleAnnotations(q, qs);
    assert.deepStrictEqual(annotations.optionNotes, { opt1: "My note" });
  });

  it("Other... note key uses $other", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["$other"] = "Other note";

    const annotations = assembleAnnotations(q, qs);
    assert.deepStrictEqual(annotations.optionNotes, { $other: "Other note" });
  });

  it("note preload: existing note is preserved when re-editing", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "Existing note";

    // Simulate pressing 'n' — note mode should preload existing text
    const noteKey = "opt1";
    const existing = qs.annotations.optionNotes[noteKey] || "";
    assert.strictEqual(existing, "Existing note");

    qs.noteInputMode = true;
    qs.noteText = existing;
    qs.editingNoteOptionIndex = 0;

    assert.strictEqual(qs.noteText, "Existing note");
    assert.strictEqual(qs.noteInputMode, true);
  });

  it("note is saved on Enter", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.noteInputMode = true;
    qs.noteText = "New note text";
    qs.editingNoteOptionIndex = 0;

    // Simulate Enter save
    const noteKey = q.options[0].id;
    qs.annotations.optionNotes![noteKey] = qs.noteText;
    qs.noteInputMode = false;
    qs.noteText = "";
    qs.editingNoteOptionIndex = -1;

    assert.strictEqual(qs.annotations.optionNotes![noteKey], "New note text");
    assert.strictEqual(qs.noteInputMode, false);
    assert.strictEqual(qs.noteText, "");
    assert.strictEqual(qs.editingNoteOptionIndex, -1);
  });

  it("blank note clears the note entry", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "Old note";

    // Simulate saving blank note
    const noteKey = q.options[0].id;
    delete qs.annotations.optionNotes![noteKey];
    qs.noteInputMode = false;
    qs.noteText = "";
    qs.editingNoteOptionIndex = -1;

    assert.strictEqual(qs.annotations.optionNotes![noteKey], undefined);
    assert.strictEqual(qs.noteInputMode, false);
  });

  it("Esc exits note mode without saving (discards changes)", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "Original";
    qs.noteInputMode = true;
    qs.noteText = "Changed";
    qs.editingNoteOptionIndex = 0;

    // Simulate Esc — discard changes
    qs.noteInputMode = false;
    qs.noteText = "";
    qs.editingNoteOptionIndex = -1;

    // Original note should be unchanged
    assert.strictEqual(qs.annotations.optionNotes!["opt1"], "Original");
    assert.strictEqual(qs.noteInputMode, false);
    assert.strictEqual(qs.noteText, "");
  });

  it("Other... note uses $other key when focused on Other... option", () => {
    const q = makeQuestion();
    const qs = makeBaseState();

    // Simulate focus on Other... option (index == options.length)
    qs.focusIndex = q.options.length;
    const isOther = qs.focusIndex >= q.options.length;
    assert.strictEqual(isOther, true);

    const noteKey = isOther ? "$other" : q.options[qs.focusIndex].id;
    assert.strictEqual(noteKey, "$other");

    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes[noteKey] = "Other note";

    const annotations = assembleAnnotations(q, qs);
    assert.ok("$other" in (annotations.optionNotes || {}));
  });

  it("backspace deletes last character in note mode", () => {
    const qs = makeBaseState();
    qs.noteInputMode = true;
    qs.noteText = "Hello";

    // Simulate backspace
    qs.noteText = qs.noteText.slice(0, -1);
    assert.strictEqual(qs.noteText, "Hell");
  });

  it("backspace deletes last character in Other... mode", () => {
    const qs = makeBaseState();
    qs.otherInputMode = true;
    qs.otherText = "Hello";

    // Simulate backspace
    qs.otherText = qs.otherText.slice(0, -1);
    assert.strictEqual(qs.otherText, "Hell");
  });

  it("note annotations are deep-copied by assembleAnnotations", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "Shared";

    const annotations = assembleAnnotations(q, qs);
    // Mutate the result
    annotations.optionNotes!["opt1"] = "Mutated";

    // Original state should be unchanged
    assert.strictEqual(qs.annotations.optionNotes!["opt1"], "Shared");
  });

  it("buildResult includes option notes in annotations", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.selectedOptionId = "opt1";
    qs.answered = true;
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "My option note";
    qs.annotations.questionNotes = "My question note";

    const result = buildResult([q], new Map([["q1", qs]]), false);
    assert.ok(result.annotations);
    assert.ok(result.annotations["q1"]);
    assert.strictEqual(result.annotations["q1"]?.optionNotes?.["opt1"], "My option note");
    assert.strictEqual(result.annotations["q1"]?.questionNotes, "My question note");
  });

  it("buildResult includes $other note in annotations", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.selectedOptionId = "__other__";
    qs.otherText = "Custom answer";
    qs.answered = true;
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["$other"] = "Other option note";

    const result = buildResult([q], new Map([["q1", qs]]), false);
    assert.ok(result.annotations);
    assert.ok(result.annotations["q1"]);
    assert.strictEqual(result.annotations["q1"]?.optionNotes?.["$other"], "Other option note");
  });

  it("buildResult omits empty annotations", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.selectedOptionId = "opt1";
    qs.answered = true;

    const result = buildResult([q], new Map([["q1", qs]]), false);
    assert.strictEqual(result.annotations, undefined);
  });

  it("getRenderedOptions returns Other... with isOther flag", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    const rendered = getRenderedOptions(q, qs);

    assert.strictEqual(rendered.length, 3); // 2 built-in + Other...
    assert.strictEqual(rendered[0].id, "opt1");
    assert.strictEqual(rendered[0].isOther, false);
    assert.strictEqual(rendered[1].id, "opt2");
    assert.strictEqual(rendered[1].isOther, false);
    assert.strictEqual(rendered[2].id, "__other__");
    assert.strictEqual(rendered[2].isOther, true);
  });

  it("multiple option notes are independent", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "Note for opt1";
    qs.annotations.optionNotes["opt2"] = "Note for opt2";

    const annotations = assembleAnnotations(q, qs);
    assert.strictEqual(annotations.optionNotes!["opt1"], "Note for opt1");
    assert.strictEqual(annotations.optionNotes!["opt2"], "Note for opt2");
    assert.strictEqual(Object.keys(annotations.optionNotes || {}).length, 2);
  });

  it("multi-select question supports option notes", () => {
    const q = makeQuestion({ multiSelect: true });
    const qs = makeBaseState();
    qs.multiSelections.add("opt1");
    qs.answered = true;
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "Selected with note";

    const result = buildResult([q], new Map([["q1", qs]]), false);
    assert.ok(result.annotations);
    assert.strictEqual(result.annotations["q1"]?.optionNotes?.["opt1"], "Selected with note");
  });

  it("note editing does not affect answer serialization", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.selectedOptionId = "opt1";
    qs.answered = true;

    // Add a note
    if (!qs.annotations.optionNotes) {
      qs.annotations.optionNotes = {};
    }
    qs.annotations.optionNotes["opt1"] = "My note";

    const result = buildResult([q], new Map([["q1", qs]]), false);
    // Answer should not be affected by note
    assert.ok(result.answers);
    assert.strictEqual(result.answers["q1"]?.kind, "single");
    assert.strictEqual(result.answers["q1"]?.optionId, "opt1");
    // Note should be in annotations
    assert.strictEqual(result.annotations["q1"]?.optionNotes?.["opt1"], "My note");
  });

  it("empty optionNotes object is preserved in annotations", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    qs.annotations.optionNotes = {};

    const annotations = assembleAnnotations(q, qs);
    assert.deepStrictEqual(annotations.optionNotes, {});
  });

  it("undefined optionNotes is preserved as-is", () => {
    const q = makeQuestion();
    const qs = makeBaseState();
    // annotations.optionNotes is undefined

    const annotations = assembleAnnotations(q, qs);
    assert.strictEqual(annotations.optionNotes, undefined);
  });
});
