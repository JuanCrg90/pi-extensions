import type { AskUserQuestionParams, AskUserQuestionResult } from "./types.js";

export function buildCallSummary(args: AskUserQuestionParams): string[] {
  const qCount = args.questions.length;
  const headers = args.questions.map((q) => q.header).join(", ");
  return [
    "AskUserQuestion",
    `${qCount} question${qCount === 1 ? "" : "s"}`,
    `Headers: ${headers}`,
  ];
}

export function buildContentText(result: AskUserQuestionResult): string {
  if (result.cancelled) {
    return "User dismissed the question dialog.";
  }

  // Tool result details support custom TUI rendering but are not included in
  // model context. Keep the complete structured result in text content so the
  // agent receives option IDs, custom answers, notes, previews, and metadata.
  return `User submitted the following AskUserQuestion result:\n${JSON.stringify(result, null, 2)}`;
}

export function buildResultSummary(result: AskUserQuestionResult): string[] {
  if (result.cancelled) {
    return ["⚠ Question dialog dismissed"];
  }

  const lines: string[] = ["Question results:"];

  for (const [qid, answer] of Object.entries(result.answers ?? {})) {
    if (answer.kind === "single") {
      lines.push(`  ${qid}: ${answer.label}${answer.other ? ` (Other: ${answer.text})` : ""}`);
      continue;
    }

    if (answer.empty) {
      lines.push(`  ${qid}: (empty)`);
      continue;
    }

    const labels = answer.selections
      .map((s) => `${s.label}${s.other ? ` (Other: ${s.text})` : ""}`)
      .join(", ");
    lines.push(`  ${qid}: [${labels}]`);
  }

  const hasAnnotations = Object.values(result.annotations ?? {}).some(
    (a) => a.questionNotes || a.optionNotes || a.selectedPreview,
  );
  if (hasAnnotations) {
    lines.push("  (annotations present — see details)");
  }

  return lines;
}
