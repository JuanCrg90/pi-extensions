import type { QuestionState, DialogState } from "./types.js";

// ─── Pure navigation helpers ────────────────────────────────────────────────────

/**
 * Wrap an option index within the bounds of the options array.
 * -1 wraps to last; length wraps to 0.
 */
export function wrapOptionIndex(index: number, max: number): number {
  if (index < 0) return max - 1;
  if (index >= max) return 0;
  return index;
}

/**
 * Wrap a question index within the bounds of the questions array.
 */
export function wrapQuestionIndex(index: number, max: number): number {
  if (index < 0) return max - 1;
  if (index >= max) return 0;
  return index;
}

/**
 * Get the preferred focus index when revisiting a question.
 * - For single-select: return the index of the selected option, or 0.
 * - For multi-select: return the index of the first selected option, or 0.
 */
export function getPreferredFocusIndex(
  optionCount: number,
  selectedOptionId: string | undefined,
  multiSelections: Set<string>,
  options: Array<{ id: string }>,
): number {
  // Try to restore to the selected option (single-select)
  if (selectedOptionId) {
    const idx = options.findIndex((o) => o.id === selectedOptionId);
    if (idx >= 0) return idx;
  }

  // Try to restore to the first multi-selection
  if (multiSelections.size > 0) {
    for (let i = 0; i < options.length; i++) {
      if (multiSelections.has(options[i].id)) {
        return i;
      }
    }
  }

  return 0;
}

/**
 * Check if there are any missing required questions.
 */
export function findMissingRequired(
  questionIds: string[],
  answeredIds: Set<string>,
): string[] {
  const missing: string[] = [];
  for (const id of questionIds) {
    if (!answeredIds.has(id)) {
      missing.push(id);
    }
  }
  return missing;
}

/**
 * Determine if a review/submit tab should be shown.
 * Only for multi-question flows.
 */
export function shouldShowReviewTab(questionCount: number): boolean {
  return questionCount > 1;
}

// ─── State management helpers ───────────────────────────────────────────────────

/**
 * Initialize question state for a new question.
 */
export function initQuestionState(
  question: { id: string; multiSelect?: boolean; options: Array<{ id: string }> },
): QuestionState {
  return {
    focusIndex: 0,
    multiSelections: new Set<string>(),
    selectedOptionId: undefined,
    editingNoteOptionIndex: -1,
    otherText: "",
    otherInputMode: false,
    noteInputMode: false,
    noteText: "",
    multiSelectEmptyPending: false,
    annotations: {},
    answered: false,
  };
}

/**
 * Get the set of answered question ids from dialog state.
 */
export function getAnsweredIds(state: DialogState): Set<string> {
  const ids = new Set<string>();
  for (const [id, qs] of state.questionStates) {
    if (qs.answered) ids.add(id);
  }
  return ids;
}

/**
 * Advance to the next unanswered question, or submit if all answered.
 */
export function advanceOrReview(
  state: DialogState,
  onAllAnswered: () => void,
): void {
  // Check if all questions answered
  const allAnswered = state.questions.every(
    (q) => state.questionStates.get(q.id)?.answered,
  );

  if (allAnswered) {
    onAllAnswered();
    return;
  }

  // Advance to next unanswered question
  for (let i = 0; i < state.questions.length; i++) {
    const qs = state.questionStates.get(state.questions[i].id);
    if (!qs?.answered) {
      state.currentIndex = i;
      return;
    }
  }

  // Fallback — all answered, submit
  onAllAnswered();
}
