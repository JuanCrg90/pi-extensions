import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { Box, Container, Input, Key, matchesKey, Text, type Focusable } from "@earendil-works/pi-tui";
import type { DialogState, QuestionState } from "./types.js";
import { getMissingRequired, getFocusedOptionPreview, questionHasAnyPreview, renderPreviewPanel, renderQuestion, renderReviewTab, renderTabs } from "./render.js";
import { getPreferredFocusIndex, wrapQuestionIndex } from "./state.js";

export type DialogCallback =
  | { type: "dismiss" }
  | { type: "answered"; questionId: string }
  | { type: "focus_changed"; questionId: string; optionIndex: number }
  | { type: "other_input"; questionId: string }
  | { type: "help_toggled"; visible: boolean }
  | { type: "note_access"; questionId: string; optionId: string }
  | { type: "selection_toggled"; questionId: string; optionId: string }
  | { type: "review_enter" }
  | { type: "review_submit" }
  | { type: "review_cancel" };

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

type DialogTheme = Pick<Theme, "fg" | "bold">;

export function createDialogComponent(
  state: DialogState,
  onDone: () => void,
  onEvent: (event: DialogCallback) => void,
  theme: DialogTheme = plainTheme as DialogTheme,
): {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
  dispose(): void;
} & Focusable {
  let disposed = false;
  let componentFocused = false;
  let activeInput = new Input();

  function prepareInput(value: string): void {
    activeInput = new Input();
    // Input.setValue() preserves its old cursor position. Feeding the initial
    // value through the component places the cursor at the end for re-editing.
    if (value) activeInput.handleInput(value);
    activeInput.focused = componentFocused;
  }

  const current = () => {
    const question = state.questions[state.currentIndex];
    return { question, qState: state.questionStates.get(question.id)! };
  };

  function restoreFocus(): void {
    const { question, qState } = current();
    qState.focusIndex = getPreferredFocusIndex(
      question.options.length + 1,
      qState.selectedOptionId,
      qState.multiSelections,
      [...question.options, { id: "__other__" }],
    );
  }

  function enterReview(): void {
    state.inReviewMode = true;
    state.reviewPickerIndex = 0;
    onEvent({ type: "review_enter" });
  }

  function advance(questionId: string): void {
    const requiredComplete = getMissingRequired(state.questions, state.questionStates).length === 0;
    if (state.questions.length === 1) {
      onDone();
      return;
    }

    for (let offset = 1; offset <= state.questions.length; offset++) {
      const index = (state.currentIndex + offset) % state.questions.length;
      const question = state.questions[index];
      if (question.required !== false && !state.questionStates.get(question.id)?.answered) {
        state.currentIndex = index;
        restoreFocus();
        return;
      }
    }

    if (requiredComplete) enterReview();
    else state.statusMessage = `Answer required question ${questionId}`;
  }

  function markAnswered(): void {
    const { question, qState } = current();
    qState.answered = true;
    if (!question.multiSelect) {
      const preview = getFocusedOptionPreview(question, qState);
      if (preview) qState.annotations.selectedPreview = preview;
      else delete qState.annotations.selectedPreview;
    }
    onEvent({ type: "answered", questionId: question.id });
    advance(question.id);
  }

  function openOther(): void {
    const { question, qState } = current();
    qState.otherDraft = qState.otherText;
    prepareInput(qState.otherText);
    qState.otherInputMode = true;
    state.statusMessage = "Enter Other... text";
    onEvent({ type: "other_input", questionId: question.id });
  }

  function openNote(questionLevel = false): void {
    const { question, qState } = current();
    const isOther = qState.focusIndex >= question.options.length;
    const key = questionLevel ? "$question" : isOther ? "$other" : question.options[qState.focusIndex].id;
    qState.noteText = questionLevel
      ? qState.annotations.questionNotes ?? ""
      : qState.annotations.optionNotes?.[key] ?? "";
    qState.editingNoteOptionIndex = questionLevel ? -2 : qState.focusIndex;
    prepareInput(qState.noteText);
    qState.noteInputMode = true;
    state.statusMessage = questionLevel ? "Question note" : "Option note";
    onEvent({ type: "note_access", questionId: question.id, optionId: key });
  }

  function saveNote(qState: QuestionState): void {
    const value = qState.noteText.trim();
    if (qState.editingNoteOptionIndex === -2) {
      if (value) qState.annotations.questionNotes = value;
      else delete qState.annotations.questionNotes;
    } else {
      const { question } = current();
      const key = qState.editingNoteOptionIndex === question.options.length
        ? "$other"
        : question.options[qState.editingNoteOptionIndex]?.id;
      if (key) {
        qState.annotations.optionNotes ??= {};
        if (value) qState.annotations.optionNotes[key] = value;
        else delete qState.annotations.optionNotes[key];
        if (Object.keys(qState.annotations.optionNotes).length === 0) delete qState.annotations.optionNotes;
      }
    }
    qState.noteInputMode = false;
    qState.noteText = "";
    qState.editingNoteOptionIndex = -1;
    state.statusMessage = value ? "Note saved" : "Note cleared";
  }

  function styleLine(line: string): string {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("❯") || trimmed.includes("Review Answers") || trimmed.includes("── Preview")) {
      return theme.fg("accent", theme.bold(line));
    }
    if (trimmed.startsWith("⚠") || line.startsWith("Press Esc") || line.startsWith("Missing:")) {
      return theme.fg("warning", line);
    }
    if (trimmed.startsWith("▸")) return theme.fg("accent", line);
    if (trimmed.startsWith("✓") || trimmed.startsWith("(x)") || trimmed.startsWith("(•)")) {
      return theme.fg("success", line);
    }
    if (
      trimmed.startsWith("[") ||
      trimmed.startsWith("↑") ||
      trimmed.startsWith("←") ||
      trimmed.startsWith("Enter") ||
      trimmed.startsWith("Esc") ||
      trimmed.startsWith("Ctrl-C") ||
      trimmed.startsWith("Tab/") ||
      trimmed.startsWith("Space") ||
      trimmed.startsWith("o ") ||
      trimmed.startsWith("n /") ||
      trimmed.startsWith("? ") ||
      trimmed.startsWith("Any key")
    ) {
      return theme.fg("dim", line);
    }
    if (line.startsWith("    ")) return theme.fg("muted", line);
    return line;
  }

  function addText(container: Container, lines: string[], paddingX = 1): void {
    container.addChild(new Text(lines.map(styleLine).join("\n"), paddingX, 0));
  }

  function handleInput(data: string): void {
    if (disposed) return;
    const { question, qState } = current();

    if (state.showHelp) {
      state.showHelp = false;
      onEvent({ type: "help_toggled", visible: false });
      return;
    }

    if (matchesKey(data, Key.ctrl("c"))) {
      onEvent({ type: "dismiss" });
      return;
    }

    // Delegate editing to Pi TUI's Input component. Keep Enter/Esc here so
    // questionnaire save/cancel semantics remain explicit.
    if (qState.noteInputMode || qState.otherInputMode) {
      if (matchesKey(data, Key.escape)) {
        qState.noteInputMode = false;
        qState.otherInputMode = false;
        qState.noteText = "";
        qState.otherDraft = qState.otherText;
        qState.editingNoteOptionIndex = -1;
        state.statusMessage = "";
      } else if (matchesKey(data, Key.enter)) {
        const inputValue = activeInput.getValue();
        if (qState.noteInputMode) {
          qState.noteText = inputValue;
          saveNote(qState);
        } else {
          const value = inputValue.trim();
          if (!value) {
            state.statusMessage = "Cannot submit empty Other... text";
            return;
          }
          qState.otherText = value;
          qState.otherDraft = value;
          qState.otherInputMode = false;
          if (question.multiSelect) {
            const wasAnswered = qState.answered;
            qState.multiSelections.add("__other__");
            qState.answered = true;
            qState.multiSelectEmptyPending = false;
            state.statusMessage = "Other... added";
            if (!wasAnswered) onEvent({ type: "answered", questionId: question.id });
          } else {
            qState.selectedOptionId = "__other__";
            markAnswered();
          }
        }
      } else {
        activeInput.handleInput(data);
        if (qState.noteInputMode) qState.noteText = activeInput.getValue();
        else qState.otherDraft = activeInput.getValue();
      }
      return;
    }

    if (matchesKey(data, Key.escape)) {
      if (state.inReviewMode) {
        state.inReviewMode = false;
        restoreFocus();
      } else if (qState.multiSelectEmptyPending) {
        qState.multiSelectEmptyPending = false;
        state.statusMessage = "";
      } else if (state.pendingEscape) {
        state.pendingEscape = false;
        onEvent({ type: "dismiss" });
      } else {
        state.pendingEscape = true;
        state.statusMessage = "Press Esc again to dismiss";
      }
      return;
    }

    state.pendingEscape = false;
    if (data === "?") {
      state.showHelp = true;
      state.statusMessage = "";
      onEvent({ type: "help_toggled", visible: true });
      return;
    }

    if (state.inReviewMode) {
      if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
        state.inReviewMode = false;
        restoreFocus();
      } else if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || data === "j" || data === "k" || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
        state.reviewPickerIndex = state.reviewPickerIndex === 0 ? 1 : 0;
      } else if (matchesKey(data, Key.enter)) {
        if (state.reviewPickerIndex === 1) onEvent({ type: "review_cancel" });
        else {
          const missing = getMissingRequired(state.questions, state.questionStates);
          if (missing.length) state.statusMessage = `Missing: ${missing.join(", ")}`;
          else {
            onEvent({ type: "review_submit" });
            onDone();
          }
        }
      }
      return;
    }

    if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
      const backward = matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left);
      state.currentIndex = wrapQuestionIndex(state.currentIndex + (backward ? -1 : 1), state.questions.length);
      restoreFocus();
      state.statusMessage = "";
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || data === "j" || data === "k") {
      const up = matchesKey(data, Key.up) || data === "k";
      const count = question.options.length + 1;
      qState.focusIndex = (qState.focusIndex + (up ? -1 : 1) + count) % count;
      state.statusMessage = "";
      onEvent({ type: "focus_changed", questionId: question.id, optionIndex: qState.focusIndex });
      return;
    }

    if (data === "o") {
      openOther();
      return;
    }
    if (data === "n") {
      openNote(false);
      return;
    }
    if (data === "N") {
      openNote(true);
      return;
    }

    if (matchesKey(data, Key.space) && question.multiSelect) {
      if (qState.focusIndex === question.options.length) {
        openOther();
        return;
      }
      const option = question.options[qState.focusIndex];
      const wasAnswered = qState.answered;
      if (qState.multiSelections.has(option.id)) qState.multiSelections.delete(option.id);
      else qState.multiSelections.add(option.id);
      qState.answered = qState.multiSelections.size > 0;
      qState.multiSelectEmptyPending = false;
      state.statusMessage = qState.answered ? "Selection updated" : "No selection";
      onEvent({ type: "selection_toggled", questionId: question.id, optionId: option.id });
      if (qState.answered && !wasAnswered) onEvent({ type: "answered", questionId: question.id });
      return;
    }

    if (!matchesKey(data, Key.enter)) return;
    state.statusMessage = "";
    if (question.multiSelect) {
      if (qState.multiSelections.size === 0) {
        if (!qState.multiSelectEmptyPending) {
          qState.multiSelectEmptyPending = true;
          state.statusMessage = "No selection — Enter to confirm empty, Esc to cancel";
          return;
        }
      }
      markAnswered();
      return;
    }

    if (qState.focusIndex === question.options.length) openOther();
    else {
      qState.selectedOptionId = question.options[qState.focusIndex].id;
      markAnswered();
    }
  }

  return {
    render(width) {
      if (disposed) return [];
      const safeWidth = Math.max(1, width);
      const container = new Container();
      const borderColor = (text: string) => theme.fg("borderAccent", text);
      container.addChild(new DynamicBorder(borderColor));

      if (state.questions.length > 1) {
        addText(container, [...renderTabs(state, state.reviewPickerIndex, Math.max(1, safeWidth - 2)), ""]);
      }

      if (state.inReviewMode) {
        addText(container, renderReviewTab(state));
      } else {
        const { question, qState } = current();
        if (qState.noteInputMode || qState.otherInputMode) {
          const noteKey = qState.editingNoteOptionIndex === -2
            ? "$question"
            : qState.editingNoteOptionIndex === question.options.length
              ? "$other"
              : question.options[qState.editingNoteOptionIndex]?.id;
          const label = qState.otherInputMode
            ? "Other... answer"
            : `Note for "${noteKey === "$question" ? question.header : noteKey === "$other" ? "Other..." : noteKey}"`;
          addText(container, [state.statusMessage || `❯ ${question.header}: ${question.question}`, "", label]);
          const inputBox = new Box(1, 0);
          inputBox.addChild(activeInput);
          container.addChild(inputBox);
          addText(container, ["", "Enter save • Esc cancel • Ctrl-C dismiss"]);
        } else {
          const lines = !question.multiSelect && questionHasAnyPreview(question)
            ? renderPreviewPanel(state, state.currentIndex, Math.max(1, safeWidth - 2))
            : renderQuestion(state, state.currentIndex);
          addText(container, lines);
        }
      }

      container.addChild(new DynamicBorder(borderColor));
      return container.render(safeWidth);
    },
    invalidate() { activeInput.invalidate(); },
    handleInput,
    get focused() { return componentFocused; },
    set focused(value: boolean) {
      componentFocused = value;
      activeInput.focused = value;
    },
    dispose() { disposed = true; },
  };
}
