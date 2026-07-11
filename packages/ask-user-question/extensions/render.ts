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
  pickerIndex = state.reviewPickerIndex,
  width = 80,
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

  const lines: string[] = [];
  let line = "";
  for (const tab of tabs) {
    const next = line ? `${line}  ${tab}` : tab;
    if (line && next.length > Math.max(1, width)) {
      lines.push(line);
      line = tab;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
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
  lines.push("  ←/→  Switch submit/cancel");
  lines.push("  Enter  Confirm selection");
  lines.push("  Esc  Back to questions");
  lines.push("  Ctrl-C  Dismiss immediately");

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
    label: "recommended" in o && o.recommended ? `${o.label} (recommended)` : o.label,
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

  if (qState.noteInputMode || qState.otherInputMode) {
    // Interactive text fields are rendered by the dialog's Pi TUI Input
    // component. Keep this pure helper limited to descriptive fallback text.
    lines.push("");
    lines.push(qState.otherInputMode ? "  Other... answer" : "  Note editor");
  } else {
    const allOptions = getRenderedOptions(q, qState);
    for (let i = 0; i < allOptions.length; i++) {
      const opt = allOptions[i];
      const isFocused = i === qState.focusIndex;
      const isSelected =
        q.multiSelect
          ? qState.multiSelections.has(opt.id)
          : qState.selectedOptionId === opt.id;

      let indicator = "  ";
      if (isSelected) {
        indicator = q.multiSelect ? "(x)" : "(•)";
      }

      const label = isFocused
        ? `▸ ${opt.label}`
        : `  ${opt.label}`;

      lines.push(`${indicator} ${label}`);
      if (!opt.isOther) {
        const realOpt = q.options.find((o) => o.id === opt.id);
        if (realOpt?.description) {
          lines.push(`    ${realOpt.description}`);
        }
      }
    }

    lines.push(
      q.multiSelect
        ? "  [↑/↓: move] [Space: toggle] [Enter: confirm] [o: Other] [n/N: option/question note] [?: help]"
        : "  [↑/↓: move] [Enter: confirm] [o: Other] [n/N: option/question note] [?: help]",
    );
    lines.push("  [Tab/Shift-Tab: switch]  [Esc Esc: dismiss]  [Ctrl-C: dismiss now]");
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
    lines.push("Enter  Confirm answer / save input");
    lines.push("o  Enter Other... text");
    lines.push("n / N  Edit focused-option / question note");
    lines.push("?  Open help");
    lines.push("Any key  Close help");
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
    if (q.required !== false && !qs?.answered) {
      missing.push(q.header);
    }
  }
  return missing;
}

// ─── Preview panel ──────────────────────────────────────────────────────────────

/**
 * Check whether a single-select question has any visible option with a preview.
 */
export function questionHasAnyPreview(question: Question): boolean {
  return !question.multiSelect && question.options.some((o) => !!o.preview?.length);
}

export function hasPreviewAvailable(
  question: Question,
  qState: DialogState["questionStates"] extends Map<string, infer S> ? S : never,
): boolean {
  if (!questionHasAnyPreview(question)) return false;
  const focusedIdx = qState.focusIndex;
  const allOptions = getRenderedOptions(question, qState);
  const focusedOpt = allOptions[focusedIdx];
  if (focusedOpt?.isOther) return false;
  const realOpt = question.options.find((o) => o.id === focusedOpt?.id);
  return !!(realOpt?.preview && realOpt.preview.length > 0);
}

/**
 * Get the preview text for the currently focused option.
 * Returns undefined if no preview is available.
 */
export function getFocusedOptionPreview(
  question: Question,
  qState: DialogState["questionStates"] extends Map<string, infer S> ? S : never,
): string | undefined {
  const allOptions = getRenderedOptions(question, qState);
  const focusedOpt = allOptions[qState.focusIndex];
  if (focusedOpt?.isOther) return undefined;
  const realOpt = question.options.find((o) => o.id === focusedOpt?.id);
  return realOpt?.preview && realOpt.preview.length > 0 ? realOpt.preview : undefined;
}

/**
 * Render a side-by-side preview panel.
 * Left column: options list.
 * Right column: preview text for the focused option.
 * Falls back to single-column if terminal is too narrow.
 */
export function renderPreviewPanel(
  state: DialogState,
  questionIdx: number,
  terminalWidth: number,
): string[] {
  const q = state.questions[questionIdx];
  const qState = state.questionStates.get(q.id)!;

  if (qState.noteInputMode || qState.otherInputMode || !questionHasAnyPreview(q)) {
    return renderQuestion(state, questionIdx);
  }

  const previewText = getFocusedOptionPreview(q, qState) ?? "(no preview)";
  const wrapWidth = Math.max(10, Math.min(terminalWidth - 4, 40));
  const previewBody: string[] = [];
  let remaining = previewText;
  while (remaining.length > 0) {
    let breakAt = remaining.indexOf(" ", wrapWidth);
    if (breakAt === -1 || breakAt < wrapWidth - 10) {
      breakAt = Math.min(remaining.length, wrapWidth);
    }
    if (breakAt === 0) breakAt = wrapWidth;
    const chunk = remaining.slice(0, breakAt).trim();
    previewBody.push(`  ${chunk}`);
    remaining = remaining.slice(breakAt).trim();
  }
  if (previewBody.length === 0) {
    previewBody.push("  (no preview)");
  }

  if (terminalWidth <= 32) {
    const lines = renderQuestion(state, questionIdx);
    lines.push("");
    lines.push("  ── Preview ──");
    lines.push(...previewBody);
    return lines;
  }

  const lines: string[] = [];
  lines.push(state.statusMessage || `❯ ${q.header}: ${q.question}`);

  const leftWidth = Math.floor(terminalWidth * 0.45);
  const allOptions = getRenderedOptions(q, qState);
  const optionLines: string[] = [];
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i];
    const isFocused = i === qState.focusIndex;
    const isSelected = qState.selectedOptionId === opt.id;
    const indicator = isSelected ? "(•)" : "  ";
    const label = isFocused ? `▸ ${opt.label}` : `  ${opt.label}`;
    optionLines.push(`${indicator} ${label}`);
    if (!opt.isOther) {
      const realOpt = q.options.find((o) => o.id === opt.id);
      if (realOpt?.description) {
        optionLines.push(`    ${realOpt.description}`);
      }
    }
  }

  const previewLines = ["  ── Preview ──", ...previewBody];
  const maxLines = Math.max(optionLines.length, previewLines.length);
  for (let i = 0; i < maxLines; i++) {
    const left = optionLines[i] || "";
    const right = previewLines[i] || "";
    lines.push(`${left.padEnd(leftWidth)} ${right}`);
  }

  lines.push("  [↑/↓: move]  [Enter: confirm]  [o: Other...]  [n: note]  [?: help]");
  lines.push("  [Tab/Shift-Tab: switch]  [Esc Esc: dismiss]  [Ctrl-C: dismiss now]");

  if (state.showHelp) {
    lines.push("");
    lines.push("━━━ Help ━━━");
    lines.push("↑/↓ j/k  Move focus");
    lines.push("Tab/Shift+Tab  Next/prev question");
    lines.push("←/→  Navigate tabs (multi-question)");
    lines.push("Enter  Confirm answer / save input");
    lines.push("o  Enter Other... text");
    lines.push("n / N  Edit focused-option / question note");
    lines.push("?  Open help");
    lines.push("Any key  Close help");
    lines.push("Esc  Warning → dismiss on second press");
    lines.push("Ctrl-C  Dismiss immediately");
    lines.push("━━━━━━━━");
  }

  if (state.pendingEscape) {
    lines.push("  ⚠ Press Esc again to dismiss to chat");
  }

  return lines;
}
