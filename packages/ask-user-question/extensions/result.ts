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
  // Check for "Other..." answer
  if (state.otherInputMode && state.otherText.trim().length > 0) {
    return {
      kind: "single",
      label: "Other...",
      other: true,
      text: state.otherText.trim(),
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

  // Add built-in selections in focus order
  for (const optId of state.multiSelections) {
    const opt = question.options.find((o) => o.id === optId);
    if (opt) {
      selections.push({
        optionId: opt.id,
        label: opt.label,
      });
    }
  }

  // Add "Other..." if present
  if (state.otherText.trim().length > 0) {
    selections.push({
      label: "Other...",
      other: true,
      text: state.otherText.trim(),
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
 */
export function assembleAnnotations(
  question: Question,
  state: QuestionState,
  selectedPreview?: string,
): QuestionAnnotations {
  const annotations: QuestionAnnotations = { ...state.annotations };

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
    return { cancelled: true, metadata };
  }

  const answers: Record<string, AnswerValue> = {};
  const annotations: Record<string, QuestionAnnotations> = {};

  for (const q of questions) {
    const state = questionStates.get(q.id);
    if (!state) continue;

    // Serialize answers keyed by question.id
    if (q.multiSelect) {
      const answer = serializeMultiAnswer(q, state, false);
      answers[q.id] = answer;
    } else {
      const answer = serializeSingleAnswer(q, state);
      if (answer) {
        answers[q.id] = answer;
      }
    }

    // Serialize annotations keyed by question.id
    annotations[q.id] = assembleAnnotations(q, state);
  }

  return { cancelled: false, answers, annotations, metadata };
}
