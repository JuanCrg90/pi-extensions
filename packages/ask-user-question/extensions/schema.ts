import { Type } from "@sinclair/typebox";

/**
 * TypeBox schema for a single Option.
 */
export const OptionSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, description: "Unique identifier for this option" }),
    label: Type.String({ description: "Display label shown to the user" }),
    description: Type.String({ description: "Description shown below the label" }),
    preview: Type.Optional(Type.String({ description: "Preview text shown when selected (single-select only)" })),
    recommended: Type.Optional(Type.Boolean({ description: "Mark this as the recommended choice" })),
  },
  { additionalProperties: false },
);

/**
 * TypeBox schema for a single Question.
 */
export const QuestionSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, description: "Unique identifier for this question" }),
    question: Type.String({
      description: "Full question text (must end with '?')",
    }),
    header: Type.String({
      description: "Short header (max 12 characters)",
    }),
    multiSelect: Type.Optional(Type.Boolean({ description: "If true, user can select multiple options" })),
    options: Type.Array(OptionSchema, {
      description: "Available answer options",
    }),
    required: Type.Optional(Type.Boolean({ description: "Whether this question requires an answer", default: true })),
  },
  { additionalProperties: false },
);

/**
 * TypeBox schema for AskUserQuestionParams.
 */
export const AskUserQuestionParameters = Type.Object(
  {
    questions: Type.Array(QuestionSchema, {
      minItems: 1,
      maxItems: 8,
      description: "One to eight questions to ask the user",
    }),
    metadata: Type.Optional(
      Type.Object(
        {
          source: Type.Optional(Type.String()),
          flowId: Type.Optional(Type.String()),
          tags: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
