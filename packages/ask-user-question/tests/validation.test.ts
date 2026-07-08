import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateParams } from "../extensions/validation.js";
import type { AskUserQuestionParams } from "../extensions/types.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeValidPayload(overrides?: Partial<AskUserQuestionParams>): AskUserQuestionParams {
  return {
    questions: [
      {
        id: "q1",
        question: "Which framework?",
        header: "Framework",
        options: [
          { id: "opt1", label: "React", description: "UI library" },
          { id: "opt2", label: "Vue", description: "Progressive framework" },
        ],
      },
    ],
    ...overrides,
  };
}

function makeValidMultiPayload(overrides?: Partial<AskUserQuestionParams>): AskUserQuestionParams {
  return {
    questions: [
      {
        id: "q1",
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { id: "opt1", label: "Auth", description: "Authentication" },
          { id: "opt2", label: "DB", description: "Database" },
        ],
      },
    ],
    ...overrides,
  };
}

function run(params: AskUserQuestionParams): string[] {
  return validateParams(params);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("validateParams", () => {
  it("accepts valid single-question payload", () => {
    const errors = run(makeValidPayload());
    assert.deepStrictEqual(errors, []);
  });

  it("accepts valid multi-question payload", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Which framework?",
          header: "Framework",
          options: [
            { id: "opt1", label: "React", description: "UI library" },
            { id: "opt2", label: "Vue", description: "Progressive framework" },
          ],
        },
        {
          id: "q2",
          question: "Which style?",
          header: "Style",
          options: [
            { id: "opt3", label: "CSS", description: "Plain CSS" },
            { id: "opt4", label: "Tailwind", description: "Utility-first" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.deepStrictEqual(errors, []);
  });

  it("rejects too few questions", () => {
    const errors = run({ questions: [] });
    assert.ok(errors.some((e) => e.includes("at least 1 question")));
  });

  it("rejects too many questions", () => {
    const questions = Array.from({ length: 9 }, (_, i) => ({
      id: `q${i}`,
      question: `Question ${i}?`,
      header: `Q${i}`,
      options: [
        { id: `o${i}a`, label: "A", description: "desc" },
        { id: `o${i}b`, label: "B", description: "desc" },
      ],
    }));
    const errors = run({ questions });
    assert.ok(errors.some((e) => e.includes("at most 8 questions")));
  });

  it("rejects too few options", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick one?",
          header: "Pick",
          options: [{ id: "opt1", label: "Only", description: "One option" }],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("at least 2 options")));
  });

  it("rejects too many options", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick one?",
          header: "Pick",
          options: [
            { id: "o1", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
            { id: "o3", label: "C", description: "c" },
            { id: "o4", label: "D", description: "d" },
            { id: "o5", label: "E", description: "e" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("at most 4 options")));
  });

  it("rejects duplicate question ids", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "dup",
          question: "First?",
          header: "First",
          options: [
            { id: "o1", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
        {
          id: "dup",
          question: "Second?",
          header: "Second",
          options: [
            { id: "o3", label: "C", description: "c" },
            { id: "o4", label: "D", description: "d" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("Duplicate question id")));
  });

  it("rejects duplicate option ids within a question", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick?",
          header: "Pick",
          options: [
            { id: "same", label: "A", description: "a" },
            { id: "same", label: "B", description: "b" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("duplicate option id")));
  });

  it("rejects duplicate labels within a question", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick?",
          header: "Pick",
          options: [
            { id: "o1", label: "Same", description: "a" },
            { id: "o2", label: "Same", description: "b" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("duplicate option label")));
  });

  it("rejects explicit 'Other' label", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick?",
          header: "Pick",
          options: [
            { id: "o1", label: "Other", description: "Other option" },
            { id: "o2", label: "A", description: "a" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("Other")));
  });

  it("rejects preview on multi-select", () => {
    const params = makeValidMultiPayload({
      questions: [
        {
          id: "q1",
          question: "Pick?",
          header: "Pick",
          multiSelect: true,
          options: [
            { id: "o1", label: "A", description: "a", preview: "preview text" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("Previews")));
  });

  it("rejects invalid header length", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick?",
          header: "This header is way too long",
          options: [
            { id: "o1", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("header") && e.includes("max 12")));
  });

  it("rejects question text without trailing ?", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick an option",
          header: "Pick",
          options: [
            { id: "o1", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("'?")));
  });

  it("rejects blank question id", () => {
    const params = { questions: [{ id: "", question: "Pick?", header: "Pick", options: [{ id: "o1", label: "A", description: "a" }, { id: "o2", label: "B", description: "b" }] }] };
    const errors = run(params as unknown as AskUserQuestionParams);
    assert.ok(errors.some((e) => e.includes("non-empty") || e.includes("missing")));
  });

  it("rejects blank option id", () => {
    const params = makeValidPayload({
      questions: [
        {
          id: "q1",
          question: "Pick?",
          header: "Pick",
          options: [
            { id: "", label: "A", description: "a" },
            { id: "o2", label: "B", description: "b" },
          ],
        },
      ],
    });
    const errors = run(params);
    assert.ok(errors.some((e) => e.includes("non-empty 'id'")));
  });
});
