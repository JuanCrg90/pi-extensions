import type { DialogState, Question, QuestionState } from "./types.js";

// ─── Pure render helpers ────────────────────────────────────────────────────────

/**
 * Build a short label for a single answered question.
 */
export function renderQuestionSummary(
  question: Question,
  qState: DialogState["questionStates"] extends Map<string, infer S> ? S : never,
): string {
  if (question.multiSelect) {
    const items: string[] = [];
    for (const optId of qState.multiSelections) {
      if (optId === "__other__") {
        if (qState.otherText.trim().length > 0) {
          items.push(`Other(${qState.otherText.trim()})`);
        }
      } else {
        const opt = question.options.find((o) => o.id === optId);
        if (opt) items.push(opt.label);
      }
    }
    const label = items.length > 0 ? items.join(", ") : "(empty)";
    return `  ✓ ${question.header}: ${label}`;
  }
  const optId = qState.selectedOptionId;
  if (optId === "__other__") {
    return qState.otherInputMode
      ? `  ◌ ${question.header}: Other... (typing)`
      : `  ✓ ${question.header}: Other(${qState.otherText.trim() || "(empty)"})`;
  }
  const opt = question.options.find((o) => o.id === optId);
  const label = opt ? opt.label : "(not selected)";
  return `  ✓ ${question.header}: ${label}`;
}

/**
 * Build the tab/chip bar for multi-question flows.
 * Shows one chip per question + submit/cancel when in review mode.
 */
export function renderTabs(
  state: DialogState,
  pickerIndex: number,
): string[] {
  const tabs: string[] = [];

  // Question chips
  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const qs = state.questionStates.get(q.id);
    const isActive = state.currentIndex === i && !state.inReviewMode;
    const isAnswered = !!qs?.answered;

    let chip: string;
    if (isActive) {
      chip = `▸ ${q.header}`;
    } else if (isAnswered) {
      chip = `✓ ${q.header}`;
    } else {
      chip = `○ ${q.header}`;
    }
    tabs.push(chip);
  }

  // Submit/cancel tab in review mode
  if (state.inReviewMode) {
    tabs.push(`${pickerIndex === 0 ? "(•)" : "( )"} submit  ${pickerIndex === 1 ? "(•)" : "( )"} cancel`);
  }

  return tabs;
}

/**
 * Render the review/submit tab view.
 */
export function renderReviewTab(state: DialogState): string[] {
  const lines: string[] = [];
  lines.push("━━━ Review Answers ━━━");

  for (const q of state.questions) {
    const qs = state.questionStates.get(q.id)!;
    const summary = renderQuestionSummary(q, qs);
    lines.push(summary);
  }

  lines.push("");

  // Check for missing required questions
  const missing = getMissingRequired(state.questions, state.questionStates);
  if (missing.length > 0) {
    lines.push(`  ⚠ Missing: ${missing.join(", ")}`);
    lines.push("");
    lines.push("  Enter on submit to check");
  } else {
    lines.push("  ✓ All questions answered");
    lines.push("");
  }

  // Submit / Cancel picker
  const submitLabel = state.reviewPickerIndex === 0
    ? "(•) Submit answers"
    : "( ) Submit answers";
  const cancelLabel = state.reviewPickerIndex === 1
    ? "(•) Cancel (dismiss)"
    : "( ) Cancel (dismiss)";
  lines.push(`  ${submitLabel}`);
  lines.push(`  ${cancelLabel}`);
  lines.push("");
  lines.push("  ↑/↓ j/k  Move picker");
  lines.push("  Enter  Confirm selection");
  lines.push("  Esc  Back to questions");

  return lines;
}

/**
 * Build the rendered options list for a question, auto-injecting
 * the "Other..." option at the bottom.
 */
export function getRenderedOptions(
  question: { id: string; multiSelect?: boolean; options: Array<{ id: string }> },
  _qState: DialogState["questionStates"] extends Map<string, infer S> ? S : never,
): Array<{ id: string; label: string; isOther: boolean }> {
  const opts = question.options.map((o) => ({
    id: o.id,
    label: o.label,
    isOther: false,
  }));
  opts.push({ id: "__other__", label: "Other...", isOther: true });
  return opts;
}

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

  if (qState.noteInputMode) {
    // Note editor
    const noteKey =
      qState.editingNoteOptionIndex === q.options.length
        ? "$other"
        : q.options[qState.editingNoteOptionIndex]?.id || "";
    const noteLabel = noteKey === "$other" ? "Other..." : noteKey;
    lines.push("");
    lines.push(`  Note for "${noteLabel}"`);
    lines.push("");
    lines.push(`  ┌─────────────────────────────────────┐`);
    // Split note text into lines for multi-line support
    const maxLineLen = 36;
    const text = qState.noteText;
    for (let i = 0; i < text.length; i += maxLineLen) {
      const chunk = text.slice(i, i + maxLineLen);
      lines.push(`  │ ${chunk}${" ".repeat(maxLineLen - chunk.length)} │`);
    }
    lines.push(`  │${" ".repeat(maxLineLen)}│`);
    lines.push(`  └─────────────────────────────────────┘`);
    lines.push("");
    lines.push(
      `  [Enter: save]  [Esc: cancel]  [Backspace: delete]`,
    );
  } else {
    // Options (auto-inject "Other..." at the end)
    const allOptions = getRenderedOptions(q, qState);
    for (let i = 0; i < allOptions.length; i++) {
      const opt = allOptions[i];
      const isFocused = i === qState.focusIndex;
      const isSelected =
        q.multiSelect
          ? qState.multiSelections.has(opt.id)
          : qState.selectedOptionId === opt.id;

      let indicator = "  ";
      if (qState.otherInputMode) {
        indicator = `  "${qState.otherText}"`;
      } else if (isSelected) {
        indicator = q.multiSelect ? "(x)" : "(•)";
      }

      const label = isFocused
        ? `▸ ${opt.label}`
        : `  ${opt.label}`;

      lines.push(`${indicator} ${label}`);
      // Only show descriptions for built-in options
      if (!opt.isOther) {
        const realOpt = q.options.find((o) => o.id === opt.id);
        if (realOpt?.description) {
          lines.push(`    ${realOpt.description}`);
        }
      }
    }

    // Navigation hint
    lines.push(
      `  [Enter: confirm]  [o: Other...]  [n: note]  [?: help]  [Esc: dismiss]`,
    );
  }

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
    lines.push("←/→  Navigate tabs (multi-question)");
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

/**
 * Check if there are any missing required questions.
 * Returns an array of question headers that are unanswered.
 */
export function getMissingRequired(
  questions: Question[],
  questionStates: DialogState["questionStates"],
): string[] {
  const missing: string[] = [];
  for (const q of questions) {
    const qs = questionStates.get(q.id);
    if (!qs?.answered) {
      missing.push(q.header);
    }
  }
  return missing;
}
