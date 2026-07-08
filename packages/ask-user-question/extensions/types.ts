// ─── Input types ────────────────────────────────────────────────────────────────

/**
 * Parameters for the AskUserQuestion tool.
 */
export interface AskUserQuestionParams {
  questions: Question[];
  metadata?: {
    source?: string;
    flowId?: string;
    tags?: string[];
  };
}

/**
 * A single question presented to the user.
 */
export interface Question {
  id: string;
  question: string;
  header: string;
  multiSelect?: boolean;
  options: Option[];
  required?: boolean;
}

/**
 * A single answer option within a question.
 */
export interface Option {
  id: string;
  label: string;
  description: string;
  preview?: string;
  recommended?: boolean;
}

// ─── Output types ───────────────────────────────────────────────────────────────

/**
 * Result returned after the user interacts with the question dialog.
 */
export interface AskUserQuestionResult {
  cancelled: boolean;
  answers?: Record<string, AnswerValue>;
  annotations?: Record<string, QuestionAnnotations>;
  metadata?: {
    source?: string;
    flowId?: string;
  };
}

/**
 * A user's answer — either single-select or multi-select.
 */
export type AnswerValue =
  | {
      kind: "single";
      optionId?: string;
      label: string;
      other?: boolean;
      text?: string;
    }
  | {
      kind: "multi";
      selections: Array<{
        optionId?: string;
        label: string;
        other?: boolean;
        text?: string;
      }>;
      empty: boolean;
    };

/**
 * Notes/annotations tied to a specific question.
 * Keyed by `question.id`.
 */
export interface QuestionAnnotations {
  questionNotes?: string;
  optionNotes?: Record<string, string>;
  selectedPreview?: string;
}

// ─── Internal / UI types ────────────────────────────────────────────────────────

/**
 * Internal state for a single question during the dialog.
 */
export interface QuestionState {
  /** Which option is currently focused (by index). */
  focusIndex: number;
  /** For multi-select: which option ids are currently selected. */
  multiSelections: Set<string>;
  /** For single-select: the currently selected option id (or undefined). */
  selectedOptionId?: string;
  /** Custom "Other..." text entered by the user. */
  otherText: string;
  /** Whether the user is in "Other..." text-input mode. */
  otherInputMode: boolean;
  /** For multi-select: whether user confirmed empty selection. */
  multiSelectEmptyPending: boolean;
  /** Annotations for this question. */
  annotations: QuestionAnnotations;
  /** Whether this question has been answered (Enter pressed). */
  answered: boolean;
}

/**
 * The full mutable dialog state.
 */
export interface DialogState {
  questions: Question[];
  /** Per-question state. */
  questionStates: Map<string, QuestionState>;
  /** Currently active question index (0-based). */
  currentIndex: number;
  /** Whether the user has pressed Esc once (showing a warning). */
  pendingEscape: boolean;
  /** Whether the help overlay is visible. */
  showHelp: boolean;
  /** Status message line shown at bottom of screen. */
  statusMessage: string;
  /** Whether we are in review/submit mode (multi-question only). */
  inReviewMode: boolean;
  /** Optional metadata preserved in the final result. */
  metadata?: {
    source?: string;
    flowId?: string;
  };
}
