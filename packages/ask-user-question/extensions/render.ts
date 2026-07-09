import type { DialogState, Question } from "./types.js";

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
