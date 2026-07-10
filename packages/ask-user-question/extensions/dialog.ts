import type {
  AskUserQuestionResult,
  DialogState,
  Question,
} from "./types.js";
import { wrapOptionIndex } from "./state.js";
import { buildResult } from "./result.js";
import {
  renderQuestionSummary,
  renderTabs,
  renderReviewTab,
  getMissingRequired,
  renderQuestion,
  renderPreviewPanel,
  getRenderedOptions,
  hasPreviewAvailable,
} from "./render.js";

// ─── Dialog component ───────────────────────────────────────────────────────────

/**
 * Callback types for the dialog component.
 */
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

/**
 * Create a TUI component for the question dialog.
 *
 * @param state - The mutable dialog state.
 * @param onDone - Called when the dialog is dismissed or completed.
 * @param onEvent - Called for significant user actions.
 * @returns A TUI component with render + handleInput.
 */
export function createDialogComponent(
  state: DialogState,
  onDone: () => void,
  onEvent: (ev: DialogCallback) => void,
): {
  render(width: number): string[];
  invalidate(): void;
  handleInput(char: string, key: unknown): void;
  dispose(): void;
} {
  let disposed = false;

  // ── Mark a question answered and advance ─────────────────────────
  function markAnsweredAndAdvance(questionId: string): void {
    const q = state.questions[state.currentIndex];
    const qState = state.questionStates.get(questionId);
    if (qState) qState.answered = true;

    // Store selected preview in annotations (single-select only)
    if (!q.multiSelect && qState) {
      const preview = getFocusedOptionPreview(q, qState);
      if (preview) {
        if (!qState.annotations.selectedPreview) {
          qState.annotations.selectedPreview = preview;
        }
      }
    }

    const allAnswered = state.questions.every(
      (q) => state.questionStates.get(q.id)?.answered,
    );

    if (allAnswered) {
      onEvent({ type: "answered", questionId });
      return;
    }

    for (let i = 0; i < state.questions.length; i++) {
      const qs = state.questionStates.get(state.questions[i].id);
      if (!qs?.answered) {
        state.currentIndex = i;
        break;
      }
    }
  }

  // ── Input handler ────────────────────────────────────────────────
  function handleInput(char: string, _key: unknown): void {
    if (disposed) return;

    const currentQ = state.questions[state.currentIndex];
    const qState = state.questionStates.get(currentQ.id)!;
    if (!qState) return;

    // Help overlay — any key closes it
    if (state.showHelp) {
      state.showHelp = false;
      state.statusMessage = "";
      onEvent({ type: "help_toggled", visible: false });
      return;
    }

    // Escape — exit input mode, or warning/dismiss
    if (char === "\x1b") {
      // In Note mode: discard and exit
      if (qState.noteInputMode) {
        qState.noteInputMode = false;
        qState.noteText = "";
        qState.editingNoteOptionIndex = -1;
        state.statusMessage = "";
        return;
      }
      // In Other... input mode: exit without losing prior text
      if (qState.otherInputMode) {
        qState.otherInputMode = false;
        state.statusMessage = "";
        return;
      }
      if (state.pendingEscape) {
        state.statusMessage = "";
        state.pendingEscape = false;
        onEvent({ type: "dismiss" });
        return;
      }
      // Cancel multi-select empty-pending if active
      if (currentQ.multiSelect && qState.multiSelectEmptyPending) {
        qState.multiSelectEmptyPending = false;
        state.statusMessage = "";
        return;
      }
      state.pendingEscape = true;
      state.statusMessage = "Press Esc again to dismiss";
      return;
    }

    // Ctrl-C — immediate dismiss
    if (char === "\x03") {
      state.statusMessage = "";
      onEvent({ type: "dismiss" });
      return;
    }

    // Help key
    if (char === "?") {
      state.showHelp = true;
      state.pendingEscape = false;
      state.statusMessage = "";
      onEvent({ type: "help_toggled", visible: true });
      return;
    }

    // Tab / Shift+Tab — navigate questions (enter/exit review mode)
    if (char === "\t" || _key === "ShiftTab") {
      state.pendingEscape = false;
      state.statusMessage = "";
      const isForward = char === "\t";

      // In review mode: switch to first question (forward) or exit (backward)
      if (state.inReviewMode) {
        state.inReviewMode = false;
        state.currentIndex = 0;
        return;
      }

      // Check if all answered — enter review mode
      const allAnswered = state.questions.every(
        (q) => state.questionStates.get(q.id)?.answered,
      );
      if (allAnswered) {
        state.inReviewMode = true;
        onEvent({ type: "review_enter" });
        return;
      }

      // Normal: navigate unanswered questions
      for (let i = isForward ? 0 : state.questions.length - 1;
           isForward ? i < state.questions.length : i >= 0;
           i += isForward ? 1 : -1) {
        const qs = state.questionStates.get(state.questions[i].id);
        if (!qs?.answered || i === state.currentIndex) {
          state.currentIndex = i;
          break;
        }
      }
      return;
    }

    // ←/→ — navigate tabs in review mode
    if (char === "C" || char === "D") {
      if (state.inReviewMode) {
        state.pendingEscape = false;
        state.statusMessage = "";
        // C=left (submit), D=right (cancel) in the picker
        const isRight = char === "D";
        state.reviewPickerIndex = isRight
          ? (state.reviewPickerIndex + 1) % 2
          : (state.reviewPickerIndex - 1 + 2) % 2;
        return;
      }
    }

    // Arrow keys (A=up, B=down) and j/k — wrap over built-in options + Other...
    // Also used for review picker navigation
    if (char === "A" || char === "B" || char === "j" || char === "k") {
      state.pendingEscape = false;
      state.statusMessage = "";

      // In review mode: navigate submit/cancel picker
      if (state.inReviewMode) {
        const isUp = char === "A" || char === "k";
        state.reviewPickerIndex = isUp ? 1 : 0;
        return;
      }

      // Normal mode: option navigation
      if (qState.otherInputMode) return;
      const isUp = char === "A" || char === "k";
      // Max index includes the auto-injected "Other..." option
      const maxIdx = currentQ.options.length;
      const prevFocus = qState.focusIndex;
      qState.focusIndex = isUp
        ? prevFocus - 1 < 0 ? maxIdx : prevFocus - 1
        : prevFocus + 1 > maxIdx ? 0 : prevFocus + 1;
      onEvent({
        type: "focus_changed",
        questionId: currentQ.id,
        optionIndex: qState.focusIndex,
      });
      return;
    }

    // Space — toggle multi-select
    if (char === " ") {
      if (currentQ.multiSelect && !qState.otherInputMode) {
        const opt = currentQ.options[qState.focusIndex];
        if (qState.multiSelections.has(opt.id)) {
          qState.multiSelections.delete(opt.id);
        } else {
          qState.multiSelections.add(opt.id);
        }
        onEvent({
          type: "selection_toggled",
          questionId: currentQ.id,
          optionId: opt.id,
        });
        // Clear empty-pending whenever user makes a selection
        qState.multiSelectEmptyPending = false;
        state.statusMessage = qState.multiSelections.size > 0
          ? "Selection updated"
          : "Deselected";
      }
      return;
    }

    // Enter — confirm / submit / review picker action
    if (char === "\n" || char === "\r") {
      state.pendingEscape = false;
      state.statusMessage = "";

      // In review mode: submit or cancel
      if (state.inReviewMode) {
        if (state.reviewPickerIndex === 0) {
          const missing = getMissingRequired(state.questions, state.questionStates);
          if (missing.length > 0) {
            state.statusMessage = `Missing: ${missing.join(", ")}`;
            return;
          }
          const dialogResult = buildResult(
            state.questions,
            state.questionStates,
            false,
            state.metadata,
          );
          onEvent({ type: "review_submit" });
          onDone(dialogResult);
          return;
        }
        onEvent({ type: "review_cancel" });
        onDone(null);
        return;
      }

      // Note mode: save note
      if (qState.noteInputMode) {
        const noteKey =
          qState.editingNoteOptionIndex === currentQ.options.length
            ? "$other"
            : currentQ.options[qState.editingNoteOptionIndex]?.id || "";
        if (!qState.annotations.optionNotes) {
          qState.annotations.optionNotes = {};
        }
        const trimmed = qState.noteText.trim();
        if (trimmed.length === 0) {
          // Clear the note if empty
          delete qState.annotations.optionNotes[noteKey];
        } else {
          qState.annotations.optionNotes[noteKey] = qState.noteText;
        }
        qState.noteInputMode = false;
        qState.noteText = "";
        qState.editingNoteOptionIndex = -1;
        state.statusMessage = trimmed.length > 0 ? "Note saved" : "Note cleared";
        return;
      }

      if (qState.otherInputMode) {
        // Submitting "Other..." text
        const trimmed = qState.otherText.trim();
        if (trimmed.length === 0) {
          // Reject empty submission — stay in input mode
          state.statusMessage = "Cannot submit empty Other... text";
          return;
        }
        qState.otherText = trimmed;
        if (currentQ.multiSelect) {
          // Multi-select: toggle "Other..." selection based on text
          if (trimmed.length > 0) {
            qState.multiSelections.add("__other__");
          } else {
            qState.multiSelections.delete("__other__");
          }
          // Don't auto-advance; let user continue or press Esc to exit
          qState.otherInputMode = false;
          state.statusMessage = trimmed.length > 0 ? "Other... added" : "Other... removed";
          return;
        } else {
          // Single-select: confirm and advance
          qState.selectedOptionId = "__other__";
          qState.otherInputMode = false;
          markAnsweredAndAdvance(currentQ.id);
          return;
        }
      }

      // Regular confirmation
      const focusedOpt = currentQ.options[qState.focusIndex];
      if (currentQ.multiSelect) {
        // Multi-select: check if empty selection
        if (qState.multiSelections.size === 0) {
          // No selections — require explicit confirmation
          if (qState.multiSelectEmptyPending) {
            // Second Enter — confirm empty
            qState.answered = true;
            markAnsweredAndAdvance(currentQ.id);
          } else {
            // First Enter — show confirmation prompt
            qState.multiSelectEmptyPending = true;
            state.statusMessage =
              "No selection — Enter to confirm empty, Esc to cancel";
            onEvent({
              type: "answered",
              questionId: currentQ.id,
            });
          }
        } else {
          // Has selections — confirm normally
          qState.answered = true;
          markAnsweredAndAdvance(currentQ.id);
        }
      } else {
        if (focusedOpt.id === "__other__") {
          qState.otherInputMode = true;
          // otherText is already preserved from prior entry (if any)
          state.statusMessage = "Enter custom text (Enter to confirm, Esc to cancel)";
          onEvent({ type: "other_input", questionId: currentQ.id });
          return;
        }
        qState.selectedOptionId = focusedOpt.id;
        qState.answered = true;
        markAnsweredAndAdvance(currentQ.id);
      }
      return;
    }

    // o — open "Other..." input (preloads prior custom text)
    if (char === "o") {
      qState.otherInputMode = true;
      // otherText already preserved from prior entry (if any)
      state.statusMessage = "Enter Other... text (Enter to confirm, Esc to cancel)";
      onEvent({ type: "other_input", questionId: currentQ.id });
      return;
    }

    // n — enter note-edit mode for focused option
    if (char === "n") {
      const isOther = qState.focusIndex >= currentQ.options.length;
      const noteKey = isOther ? "$other" : currentQ.options[qState.focusIndex].id;
      const label = isOther ? "Other..." : currentQ.options[qState.focusIndex].label;

      if (!qState.annotations.optionNotes) {
        qState.annotations.optionNotes = {};
      }
      const existing = qState.annotations.optionNotes[noteKey] || "";

      qState.noteInputMode = true;
      qState.noteText = existing;
      qState.editingNoteOptionIndex = qState.focusIndex;
      state.statusMessage = `Note for "${label}"`;
      onEvent({
        type: "note_access",
        questionId: currentQ.id,
        optionId: noteKey,
      });
      return;
    }

    // Backspace — delete last character
    if (char === "\x7f") {
      state.pendingEscape = false;
      state.statusMessage = "";

      if (qState.noteInputMode) {
        qState.noteText = qState.noteText.slice(0, -1);
        return;
      }

      if (qState.otherInputMode) {
        qState.otherText = qState.otherText.slice(0, -1);
        return;
      }
      return;
    }

    // Regular text input in "Other..." mode
    if (qState.otherInputMode && char.length === 1) {
      qState.otherText += char;
      return;
    }

    // Regular text input in note-edit mode
    if (qState.noteInputMode && char.length === 1) {
      qState.noteText += char;
      return;
    }
  }

  // ── Render callback ──────────────────────────────────────────────
  function render(terminalWidth: number): string[] {
    if (disposed) return [];
    const lines: string[] = [];

    // Tab bar for multi-question flows
    if (state.questions.length > 1) {
      lines.push(renderTabs(state, state.reviewPickerIndex).join("  "));
    }

    // If in review mode, show review tab
    if (state.inReviewMode) {
      lines.push(...renderReviewTab(state));
    } else {
      const currentQ = state.questions[state.currentIndex];
      const qState = state.questionStates.get(currentQ.id)!;

      // Use preview panel if available and not in special input modes
      const hasPreview =
        !currentQ.multiSelect &&
        qState &&
        hasPreviewAvailable(currentQ, qState) &&
        qState.otherInputMode === false &&
        qState.noteInputMode === false;

      if (hasPreview) {
        lines.push(...renderPreviewPanel(state, state.currentIndex, terminalWidth));
      } else {
        lines.push(...renderQuestion(state, state.currentIndex));
      }
    }

    return lines;
  }

  // ── Return component ─────────────────────────────────────────────
  return {
    render,
    invalidate() {},
    handleInput,
    dispose() {
      disposed = true;
    },
  };
}
