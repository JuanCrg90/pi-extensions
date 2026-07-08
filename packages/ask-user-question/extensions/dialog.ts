import type {
  AskUserQuestionResult,
  DialogState,
} from "./types.js";
import { wrapOptionIndex } from "./state.js";

// ─── Render helpers ─────────────────────────────────────────────────────────────

/**
 * Render the current question view as an array of display lines.
 */
export function renderQuestion(
  state: DialogState,
  questionIdx: number,
): string[] {
  const q = state.questions[questionIdx];
  const qState = state.questionStates.get(q.id)!;
  const lines: string[] = [];

  // Header/status
  lines.push(state.statusMessage || `❯ ${q.header}: ${q.question}`);

  // Options
  for (let i = 0; i < q.options.length; i++) {
    const opt = q.options[i];
    const isFocused = i === qState.focusIndex;
    const isSelected =
      q.multiSelect
        ? qState.multiSelections.has(opt.id)
        : qState.selectedOptionId === opt.id;

    let indicator = "  ";
    if (qState.otherInputMode && qState.otherText) {
      indicator = `  "${qState.otherText}"`;
    } else if (isSelected) {
      indicator = q.multiSelect ? "(x)" : "(•)";
    }

    const label = isFocused
      ? `▸ ${opt.label}`
      : `  ${opt.label}`;

    lines.push(`${indicator} ${label}`);
    if (opt.description) {
      lines.push(`    ${opt.description}`);
    }
  }

  // Other... indicator
  if (qState.otherText) {
    lines.push(`    Other: "${qState.otherText}"`);
  }

  // Navigation hint
  lines.push(
    `  [Enter: confirm]  [o: Other...]  [n: note]  [?: help]  [Esc: dismiss]`,
  );

  // Review tab hint for multi-question flows
  if (state.inReviewMode) {
    lines.push("  Review mode — Enter on submit to finish");
  }

  // Help overlay
  if (state.showHelp) {
    lines.push("");
    lines.push("━━━ Help ━━━");
    lines.push("↑/↓ j/k  Move focus");
    lines.push("Tab/Shift+Tab  Next/prev question");
    lines.push("Space  Toggle selection (multi-select)");
    lines.push("Enter  Confirm answer");
    lines.push("o  Enter Other... text");
    lines.push("n  Add/edit note for focused option");
    lines.push("?  Toggle help");
    lines.push("Esc  Warning → dismiss on second press");
    lines.push("Ctrl-C  Dismiss immediately");
    lines.push("━━━━━━━━");
  }

  // Escape warning
  if (state.pendingEscape) {
    lines.push("  ⚠ Press Esc again to dismiss to chat");
  }

  return lines;
}

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
  | { type: "selection_toggled"; questionId: string; optionId: string };

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
    const qState = state.questionStates.get(questionId);
    if (qState) qState.answered = true;

    // Check if all questions answered
    const allAnswered = state.questions.every(
      (q) => state.questionStates.get(q.id)?.answered,
    );

    if (allAnswered) {
      // Signal completion to the outer layer
      onEvent({ type: "answered", questionId });
      // The outer layer will build the result and call onDone
      return;
    }

    // Advance to next unanswered question
    for (let i = 0; i < state.questions.length; i++) {
      const qs = state.questionStates.get(state.questions[i].id);
      if (!qs?.answered) {
        state.currentIndex = i;
        break;
      }
    }
  }

  // ── Submit the final result ──────────────────────────────────────
  function submitResult(): void {
    // The outer layer handles result building; this is just a signal
    onDone();
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

    // Escape warning dismiss
    if (char === "\x1b") {
      if (state.pendingEscape) {
        state.statusMessage = "";
        state.pendingEscape = false;
        onEvent({ type: "dismiss" });
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

    // Tab — next question
    if (char === "\t") {
      state.pendingEscape = false;
      state.statusMessage = "";
      const maxIdx = state.questions.length - 1;
      state.currentIndex = state.currentIndex >= maxIdx ? 0 : state.currentIndex + 1;
      const ns = state.questionStates.get(state.questions[state.currentIndex].id)!;
      ns.focusIndex = 0;
      return;
    }

    // Arrow keys (A=up, B=down) and j/k
    if (char === "A" || char === "B" || char === "j" || char === "k") {
      if (qState.otherInputMode) return;
      state.pendingEscape = false;
      state.statusMessage = "";
      const isUp = char === "A" || char === "k";
      const maxIdx = currentQ.options.length - 1;
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
        state.statusMessage = qState.multiSelections.size > 0
          ? "Selection updated"
          : "Deselected";
      }
      return;
    }

    // Enter — confirm / submit
    if (char === "\n" || char === "\r") {
      state.pendingEscape = false;
      state.statusMessage = "";

      if (qState.otherInputMode) {
        // Submitting "Other..." text
        if (currentQ.multiSelect) {
          const text = qState.otherText.trim();
          if (text.length > 0) {
            qState.multiSelections.add("__other__");
          }
        } else {
          if (qState.otherText.trim().length > 0) {
            qState.selectedOptionId = "__other__";
          }
        }
        qState.otherInputMode = false;
        qState.otherText = "";
        markAnsweredAndAdvance(currentQ.id);
        return;
      }

      // Regular confirmation
      const focusedOpt = currentQ.options[qState.focusIndex];
      if (currentQ.multiSelect) {
        qState.answered = true;
        markAnsweredAndAdvance(currentQ.id);
      } else {
        if (focusedOpt.id === "__other__") {
          qState.otherInputMode = true;
          qState.otherText = qState.otherText;
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

    // o — open "Other..." input
    if (char === "o") {
      qState.otherInputMode = true;
      state.statusMessage = "Enter Other... text (Enter to confirm, Esc to cancel)";
      onEvent({ type: "other_input", questionId: currentQ.id });
      return;
    }

    // n — add/edit note for focused option
    if (char === "n") {
      const focusedOpt = currentQ.options[qState.focusIndex];
      if (!qState.annotations.optionNotes) {
        qState.annotations.optionNotes = {};
      }
      const existing = qState.annotations.optionNotes[focusedOpt.id] || "";
      state.statusMessage = `Note for "${focusedOpt.label}" (edit in review): ${existing || "(empty)"}`;
      onEvent({
        type: "note_access",
        questionId: currentQ.id,
        optionId: focusedOpt.id,
      });
      return;
    }

    // Regular text input in "Other..." mode
    if (qState.otherInputMode && char.length === 1) {
      qState.otherText += char;
      return;
    }
  }

  // ── Render callback ──────────────────────────────────────────────
  function render(_width: number): string[] {
    if (disposed) return [];
    return renderQuestion(state, state.currentIndex);
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
