import type { AskUserQuestionParams } from "./types.js";

/**
 * Validate AskUserQuestionParams and return a list of error messages.
 *
 * Returns an empty array for valid payloads.
 * Returns actionable, self-correctable error strings for invalid payloads.
 *
 * Rules enforced:
 * - 1–8 questions
 * - 2–4 options per question
 * - Non-empty question ids, unique within call
 * - Non-empty option ids, unique within question
 * - Question text ends with '?'
 * - Header length ≤ 12
 * - No explicit "Other" option labels
 * - No preview on multi-select questions
 * - No duplicate labels within a question
 */
export function validateParams(params: AskUserQuestionParams): string[] {
  const errors: string[] = [];

  // ── Question count ──────────────────────────────────────────────
  if (!params || !Array.isArray(params.questions)) {
    return ["AskUserQuestion requires a 'questions' array."];
  }

  const qCount = params.questions.length;
  if (qCount < 1) {
    errors.push("AskUserQuestion requires at least 1 question (got 0).");
  } else if (qCount > 8) {
    errors.push(
      `AskUserQuestion accepts at most 8 questions (got ${qCount}). Batch related decisions into ≤8 calls.`,
    );
  }

  // ── Per-question checks ─────────────────────────────────────────
  for (const q of params.questions) {
    const qId = q.id || "(missing id)";

    // Blank question id
    if (!q.id || q.id.trim().length === 0) {
      errors.push("Each question must have a non-empty 'id'.");
    } else if (q.id === "__other__" || q.id.startsWith("$")) {
      errors.push(`Question id "${q.id}" is reserved. Use an id that does not start with '$' or equal '__other__'.`);
    }

    // Duplicate question id
    const dupIds = params.questions.filter((other) => other.id === q.id);
    if (dupIds.length > 1) {
      errors.push(`Duplicate question id: "${q.id}". Each question must have a unique id.`);
    }

    // Question text must end with ?
    if (!q.question?.trim()) {
      errors.push(`Question "${qId}" must have non-empty question text.`);
    } else if (!q.question.trimEnd().endsWith("?")) {
      errors.push(`Question "${qId}" text must end with '?'. Got: "${q.question}"`);
    }

    if (!q.header?.trim()) {
      errors.push(`Question "${qId}" must have a non-empty header.`);
    } else if (q.header.length > 12) {
      errors.push(
        `Question "${qId}" header is ${q.header.length} chars (max 12). Shorten the header.`,
      );
    }

    // ── Option-level checks ─────────────────────────────────────
    const optCount = q.options.length;

    // Option count 2–4
    if (optCount < 2) {
      errors.push(
        `Question "${qId}" requires at least 2 options (got ${optCount}). Add more options.`,
      );
    } else if (optCount > 4) {
      errors.push(
        `Question "${qId}" accepts at most 4 options (got ${optCount}). Split into multiple questions if needed.`,
      );
    }

    const seenOptionIds = new Map<string, number>();
    const seenLabels = new Map<string, number>();
    let recommendedCount = 0;

    for (let i = 0; i < optCount; i++) {
      const opt = q.options[i];
      const prefix = `Question "${qId}" option[${i}]`;

      // Blank option id
      if (!opt.id || opt.id.trim().length === 0) {
        errors.push(`${prefix} must have a non-empty 'id'.`);
      } else if (opt.id === "__other__" || opt.id.startsWith("$")) {
        errors.push(`${prefix} id "${opt.id}" is reserved. Use an id that does not start with '$' or equal '__other__'.`);
      }

      // Duplicate option ids within question
      if (seenOptionIds.has(opt.id)) {
        errors.push(
          `Question "${qId}" has duplicate option id: "${opt.id}". Option ids must be unique within a question.`,
        );
      }
      seenOptionIds.set(opt.id, i);

      // Duplicate labels within question
      const normalizedLabel = opt.label?.trim().toLocaleLowerCase() ?? "";
      if (!normalizedLabel) {
        errors.push(`${prefix} must have a non-empty label.`);
      } else if (seenLabels.has(normalizedLabel)) {
        errors.push(
          `Question "${qId}" has duplicate option label: "${opt.label}". Labels must be unique within a question.`,
        );
      }
      seenLabels.set(normalizedLabel, i);
      if (!opt.description?.trim()) errors.push(`${prefix} must have a non-empty description.`);
      if (opt.recommended) recommendedCount++;

      // Forbidden explicit "Other"
      if (/^other(?:\.{3}|…)?$/i.test(opt.label.trim())) {
        errors.push(
          `Question "${qId}" option[${i}] uses "Other" as label. This tool auto-adds "Other..." — do not include it.`,
        );
      }

      // Preview on multi-select
      if (q.multiSelect && opt.preview && opt.preview.length > 0) {
        errors.push(
          `Question "${qId}" is multi-select. Previews are not supported on multi-select options.`,
        );
      }
    }

    if (recommendedCount > 1) {
      errors.push(`Question "${qId}" marks ${recommendedCount} options recommended. Mark at most one.`);
    }
  }

  return [...new Set(errors)];
}
