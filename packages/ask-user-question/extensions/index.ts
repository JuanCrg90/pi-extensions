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

// ─── Exported types for tool input typing ───────────────────────────────────────

export type AskUserQuestionInput = AskUserQuestionParams;

// ─── Re-export pure helpers for testability ─────────────────────────────────────

export { validateParams } from "./validation.js";
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
          inReviewMode: params.questions.length > 1,
          metadata,
        };

        // 5. Open interactive dialog
        let dialogResult: AskUserQuestionResult | null = null;
        let isDismissed = false;

        const customHandle = ctx.ui.custom<AskUserQuestionResult | null>(
          (tui, _theme, _kb, done) => createDialogComponent(
            state,
            () => {
              // All answers collected — build result and close
              dialogResult = buildResult(
                state.questions,
                state.questionStates,
                false,
                state.metadata,
              );
              done(dialogResult);
            },
            (ev: DialogCallback) => {
              if (ev.type === "dismiss") {
                done(null);
                return;
              }

              tui.requestRender();

              // Emit lightweight updates for key milestones
              if (ev.type === "answered") {
                _onUpdate?.({
                  content: [{ type: "text", text: "Question answered" }],
                });
              }
            },
          ),
          { overlay: true },
        );

        // Await the dialog — resolves when done() is called
        const dialogAnswer = await customHandle;

        // If done(null) was called (dismiss), mark as dismissed
        if (dialogAnswer === null) {
          isDismissed = true;
        } else {
          dialogResult = dialogAnswer;
        }

        // 6. Restore working indicator
        if (ctx.mode === "tui" && ctx.hasUI) {
          ctx.ui.setWorkingVisible(true);
        }

        // 8. Build final result and content text
        const finalResult = isDismissed
          ? { cancelled: true } as AskUserQuestionResult
          : (dialogResult ?? { cancelled: true });

        let contentText = "";
        if (finalResult.cancelled) {
          contentText = "User dismissed the question dialog.";
        } else {
          const parts: string[] = [];
          for (const [qid, answer] of Object.entries(finalResult.answers ?? {})) {
            if (answer.kind === "single") {
              parts.push(
                `  ${qid}: ${answer.label}${answer.other ? ` (Other: ${answer.text})` : ""}`,
              );
            } else {
              const selLabels = answer.selections
                .map((s) => `${s.label}${s.other ? ` (Other: ${s.text})` : ""}`)
                .join(", ");
              parts.push(`  ${qid}: [${answer.empty ? "empty" : selLabels}]`);
            }
          }
          contentText = parts.join("\n");
        }

        // 9. Emit final update if submitted
        if (!finalResult.cancelled && _onUpdate) {
          _onUpdate({
            content: [{ type: "text", text: `All questions answered.` }],
          });
        }

        return {
          content: [{ type: "text", text: contentText }],
          details: finalResult,
          terminate: finalResult.cancelled ? true : undefined,
        };
      } catch (err) {
        // Always restore working indicator on error
        if (ctx.mode === "tui" && ctx.hasUI) {
          ctx.ui.setWorkingVisible(true);
        }
        throw err;
      }
    },

    // ─── Custom renderCall ──────────────────────────────────────────
    renderCall(args: AskUserQuestionParams, theme: { fg: (color: string, text: string) => string; bold: (text: string) => string }, _context: unknown): Text {
      const qCount = args.questions.length;
      const headers = args.questions.map((q) => q.header).join(", ");
      const text = [
        theme.fg("toolTitle", theme.bold("AskUserQuestion")),
        theme.fg("muted", `  ${qCount} question${qCount !== 1 ? "s" : ""}`),
        theme.fg("dim", `  Headers: ${headers}`),
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

      const lines: string[] = [];

      if (details.cancelled) {
        return new Text(theme.fg("warning", "⚠ Question dialog dismissed"), 0, 0);
      }

      lines.push("Question results:");

      for (const [qid, answer] of Object.entries(details.answers ?? {})) {
        if (answer.kind === "single") {
          lines.push(`  ${qid}: ${answer.label}${answer.other ? ` (Other: ${answer.text})` : ""}`);
        } else if (answer.empty) {
          lines.push(`  ${qid}: (empty)`);
        } else {
          const labels = answer.selections.map((s) => s.label).join(", ");
          lines.push(`  ${qid}: [${labels}]`);
        }
      }

      if (details.annotations) {
        const hasAnnotations = Object.values(details.annotations).some(
          (a) => a.questionNotes || a.optionNotes,
        );
        if (hasAnnotations) {
          lines.push("  (annotations present — see details)");
        }
      }

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
