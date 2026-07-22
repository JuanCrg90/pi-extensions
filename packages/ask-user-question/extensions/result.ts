import type {
  AnswerValue,
  AskUserQuestionResult,
  QuestionAnnotations,
  QuestionState,
} from "./types.js";
import type { Question } from "./types.js";

// ─── Single-select serialization ────────────────────────────────────────────────

/**
 * Serialize a single-select answer from question state.
 * Returns undefined if nothing selected.
 */
export function serializeSingleAnswer(
  question: Question,
  state: QuestionState,
): AnswerValue | undefined {
  const otherText = state.otherText.trim();

  // Check for "Other..." answer.
  // After confirmation, otherInputMode is false and selectedOptionId is set
  // to "__other__", so key off the saved text as well.
  if (otherText.length > 0 && (state.otherInputMode || state.selectedOptionId === "__other__")) {
    return {
      kind: "single",
      label: "Other...",
      other: true,
      text: otherText,
    };
  }

  // Check for built-in option selection
  if (state.selectedOptionId) {
    const opt = question.options.find((o) => o.id === state.selectedOptionId);
    if (opt) {
      return {
        kind: "single",
        optionId: opt.id,
        label: opt.label,
      };
    }
  }

  return undefined;
}

// ─── Multi-select serialization ─────────────────────────────────────────────────

/**
 * Serialize a multi-select answer from question state.
 * Always returns a result (even if empty).
 */
export function serializeMultiAnswer(
  question: Question,
  state: QuestionState,
  isEmptyConfirmed: boolean,
): AnswerValue {
  const selections: AnswerValue["selections"] = [];

  // Add built-in selections in declared option order for deterministic output.
  for (const opt of question.options) {
    if (state.multiSelections.has(opt.id)) {
      selections.push({ optionId: opt.id, label: opt.label });
    }
  }

  // Add "Other..." if it was selected
  if (state.multiSelections.has("__other__")) {
    const trimmed = state.otherText.trim();
    selections.push({
      label: "Other...",
      other: true,
      text: trimmed,
    });
  }

  return {
    kind: "multi",
    selections,
    empty: selections.length === 0 && isEmptyConfirmed,
  };
}

// ─── Annotations assembly ───────────────────────────────────────────────────────

/**
 * Assemble question annotations from state.
 * Deep-copies optionNotes to avoid shared-reference mutations.
 */
export function assembleAnnotations(
  question: Question,
  state: QuestionState,
  selectedPreview?: string,
): QuestionAnnotations {
  const annotations: QuestionAnnotations = { ...state.annotations };

  // Deep-copy optionNotes to avoid shared-reference mutations
  if (state.annotations.optionNotes) {
    annotations.optionNotes = { ...state.annotations.optionNotes };
  }

  // If selectedPreview is provided and we have a preview to store
  if (selectedPreview) {
    annotations.selectedPreview = selectedPreview;
  }

  return annotations;
}

// ─── Full result assembly ───────────────────────────────────────────────────────

/**
 * Build the final AskUserQuestionResult from all question states.
 *
 * @param questions - The questions that were presented.
 * @param questionStates - Per-question state map, keyed by question.id.
 * @param cancelled - Whether the flow was cancelled.
 * @param metadata - Optional metadata to preserve.
 */
export function buildResult(
  questions: Question[],
  questionStates: Map<string, QuestionState>,
  cancelled: boolean,
  metadata?: { source?: string; flowId?: string },
): AskUserQuestionResult {
  if (cancelled) {
    return metadata ? { cancelled: true, metadata } : { cancelled: true };
  }

  const answers: Record<string, AnswerValue> = {};
  const annotations: Record<string, QuestionAnnotations> = {};

  for (const q of questions) {
    const state = questionStates.get(q.id);
    if (!state) continue;

    // Serialize answers keyed by question.id
    if (q.multiSelect) {
      if (state.answered) {
        const answer = serializeMultiAnswer(
          q,
          state,
          state.multiSelectEmptyPending,
        );
        answers[q.id] = answer;
      }
    } else {
      const answer = serializeSingleAnswer(q, state);
      if (answer) {
        answers[q.id] = answer;
      }
    }

    const questionAnnotations = assembleAnnotations(q, state);
    if (
      questionAnnotations.questionNotes ||
      questionAnnotations.selectedPreview ||
      (questionAnnotations.optionNotes && Object.keys(questionAnnotations.optionNotes).length > 0)
    ) {
      annotations[q.id] = questionAnnotations;
    }
  }

  return {
    cancelled: false,
    answers,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    ...(metadata ? { metadata } : {}),
  };
}
