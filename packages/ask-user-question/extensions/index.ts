/**
 * AskUserQuestion — Interactive question tool for Pi.
 *
 * Register a custom tool that opens a TUI dialog, collects user answers
 * keyed by stable question/option IDs, and returns a structured result.
 *
 * Architecture:
 *   types.ts      — TypeScript interfaces
 *   schema.ts     — TypeBox schema definitions
 *   validation.ts — Input validation helpers
 *   result.ts     — Answer/annotation serialization
 *   state.ts      — Navigation/state pure helpers
 *   dialog.ts     — TUI component + input handling
 *   index.ts      — Extension factory + tool registration
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type {
  AskUserQuestionParams,
  AskUserQuestionResult,
  DialogState,
} from "./types.js";
import { AskUserQuestionParameters } from "./schema.js";
import { validateParams } from "./validation.js";
import { buildResult } from "./result.js";
import { createDialogComponent, type DialogCallback } from "./dialog.js";
import { initQuestionState } from "./state.js";
import {
  buildCallSummary,
  buildContentText,
  buildResultSummary,
} from "./presentation.js";

// ─── Exported types for tool input typing ───────────────────────────────────────

export type AskUserQuestionInput = AskUserQuestionParams;

// ─── Re-export pure helpers for testability ─────────────────────────────────────

export { validateParams } from "./validation.js";
export { createDialogComponent } from "./dialog.js";
export {
  serializeSingleAnswer,
  serializeMultiAnswer,
  buildResult,
  assembleAnnotations,
} from "./result.js";
export {
  wrapOptionIndex,
  wrapQuestionIndex,
  getPreferredFocusIndex,
  findMissingRequired,
  shouldShowReviewTab,
  initQuestionState,
  getAnsweredIds,
} from "./state.js";
export {
  getRenderedOptions,
  renderQuestionSummary,
  renderTabs,
  renderReviewTab,
  getMissingRequired,
  renderQuestion,
  renderPreviewPanel,
  hasPreviewAvailable,
  questionHasAnyPreview,
  getFocusedOptionPreview,
} from "./render.js";
export {
  buildCallSummary,
  buildContentText,
  buildResultSummary,
} from "./presentation.js";

// ─── Extension factory ──────────────────────────────────────────────────────────

export default function askUserQuestion(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "AskUserQuestion",
    label: "Ask User Question",
    description:
      "Ask the user one or more structured questions in the TUI. Collects answers keyed by stable IDs. Supports single-select, multi-select, custom Other... answers, notes, and review/submit flow.",
    promptSnippet:
      "Ask the user structured questions to resolve ambiguity or collect preferences",
    promptGuidelines: [
      "Use AskUserQuestion when user preference materially changes the outcome, when multiple valid paths exist, or when batching related decisions is more efficient than serial follow-ups.",
      "Do not use AskUserQuestion for asking permission on risky actions or for plan approval already covered by another flow.",
      "Ask 1–8 questions per call, with 2–4 options each.",
      "Each question must have a unique 'id' and each option must have a unique 'id' within its question.",
      "Question text must end with '?'. Header must be ≤ 12 characters.",
      "The tool auto-adds an 'Other...' option — do not include it in your input.",
      "Preview text is only supported on single-select questions.",
      "Answers are returned keyed by question.id with optionId, label, and 'other' flag for custom answers.",
      "Use 'recommended' flag on options to suggest a preferred choice.",
    ],
    parameters: AskUserQuestionParameters,

    async execute(
      _toolCallId: string,
      params: AskUserQuestionParams,
      _signal: AbortSignal | undefined,
      _onUpdate: ((update: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }) => void) | undefined,
      ctx: ExtensionContext,
    ): Promise<{
      content: Array<{ type: string; text: string }>;
      details: Record<string, unknown>;
      terminate?: boolean;
    }> {
      // 1. Validate params
      const errors = validateParams(params);
      if (errors.length > 0) {
        throw new Error(
          `AskUserQuestion validation failed:\n${errors.join("\n")}`,
        );
      }

      // 2. Check for interactive terminal
      if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
        return {
          content: [{ type: "text", text: "AskUserQuestion requires an interactive terminal. Use pi in TUI mode." }],
          details: {},
        };
      }

      // 3. Hide working indicator
      if (ctx.mode === "tui" && ctx.hasUI) {
        ctx.ui.setWorkingVisible(false);
      }

      try {
        // 4. Build dialog state
        const metadata = params.metadata
          ? { source: params.metadata.source, flowId: params.metadata.flowId }
          : undefined;

        const qStates = new Map<string, import("./types.js").QuestionState>();
        for (const q of params.questions) {
          qStates.set(q.id, initQuestionState(q));
        }

        const state: DialogState = {
          questions: params.questions,
          questionStates: qStates,
          currentIndex: 0,
          pendingEscape: false,
          showHelp: false,
          statusMessage: "",
          inReviewMode: false,
          reviewPickerIndex: 0,
          metadata,
        };

        // 5. Open interactive dialog
        let dialogDismissed = false;
        let submittedUpdateSent = false;
        let finishDialog: ((result: AskUserQuestionResult | null) => void) | undefined;

        _onUpdate?.({
          content: [{ type: "text", text: "Dialog opened" }],
          details: { milestone: "dialog_opened", questionCount: params.questions.length },
        });

        const customHandle = ctx.ui.custom<AskUserQuestionResult | null>(
          (tui, _theme, _kb, done) => {
            finishDialog = done;
            return createDialogComponent(
              state,
              () => {
                const dialogResult = buildResult(
                  state.questions,
                  state.questionStates,
                  false,
                  state.metadata,
                );
                done(dialogResult);
              },
              (ev: DialogCallback) => {
                if (ev.type === "dismiss") {
                  dialogDismissed = true;
                  _onUpdate?.({
                    content: [{ type: "text", text: "Dialog dismissed" }],
                    details: { milestone: "dismissed", reason: "escape_or_ctrl_c" },
                  });
                  done(null);
                  return;
                }

                if (ev.type === "review_cancel") {
                  dialogDismissed = true;
                  _onUpdate?.({
                    content: [{ type: "text", text: "Dialog dismissed" }],
                    details: { milestone: "dismissed", reason: "review_cancel" },
                  });
                  done(null);
                  return;
                }

                tui.requestRender();

                if (ev.type === "answered") {
                  _onUpdate?.({
                    content: [{ type: "text", text: "Question answered" }],
                    details: { milestone: "question_answered", questionId: ev.questionId },
                  });
                }
                if (ev.type === "review_enter") {
                  _onUpdate?.({
                    content: [{ type: "text", text: "Review ready" }],
                    details: { milestone: "review_ready" },
                  });
                }
                if (ev.type === "review_submit") {
                  submittedUpdateSent = true;
                  _onUpdate?.({
                    content: [{ type: "text", text: "Answers submitted" }],
                    details: { milestone: "submitted" },
                  });
                }
              },
            );
          },
          { overlay: true },
        ) as Promise<AskUserQuestionResult | null> & { close?: () => void };

        const abortHandler = () => {
          dialogDismissed = true;
          _onUpdate?.({
            content: [{ type: "text", text: "Dialog dismissed" }],
            details: { milestone: "dismissed", reason: "signal_abort" },
          });
          finishDialog?.(null);
          customHandle.close?.();
        };

        if (_signal?.aborted) {
          abortHandler();
        } else {
          _signal?.addEventListener("abort", abortHandler, { once: true });
        }

        const dialogAnswer = await customHandle;
        _signal?.removeEventListener("abort", abortHandler);

        const finalResult = dialogDismissed || dialogAnswer === null
          ? ({ cancelled: true, metadata } as AskUserQuestionResult)
          : (dialogAnswer ?? { cancelled: true, metadata });

        if (!finalResult.cancelled && !submittedUpdateSent) {
          _onUpdate?.({
            content: [{ type: "text", text: "Answers submitted" }],
            details: { milestone: "submitted" },
          });
        }

        return {
          content: [{ type: "text", text: buildContentText(finalResult) }],
          details: finalResult,
          terminate: finalResult.cancelled ? true : undefined,
        };
      } finally {
        if (ctx.mode === "tui" && ctx.hasUI) {
          ctx.ui.setWorkingVisible(true);
        }
      }
    },

    // ─── Custom renderCall ──────────────────────────────────────────
    renderCall(args: AskUserQuestionParams, theme: { fg: (color: string, text: string) => string; bold: (text: string) => string }, _context: unknown): Text {
      const [title, count, headers] = buildCallSummary(args);
      const text = [
        theme.fg("toolTitle", theme.bold(title)),
        theme.fg("muted", `  ${count}`),
        theme.fg("dim", `  ${headers}`),
      ].join("\n");
      return new Text(text, 0, 0);
    },

    // ─── Custom renderResult ────────────────────────────────────────
    renderResult(
      result: { content: Array<{ type: string; text?: string }>; details?: unknown },
      _options: unknown,
      theme: { fg: (color: string, text: string) => string },
      _context: unknown,
    ): Text {
      const details = result.details as AskUserQuestionResult | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text ?? "" : "", 0, 0);
      }

      const lines = buildResultSummary(details);
      if (details.cancelled) {
        return new Text(theme.fg("warning", lines[0] ?? "⚠ Question dialog dismissed"), 0, 0);
      }
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
