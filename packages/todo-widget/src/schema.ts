import { Type } from "@sinclair/typebox";

export const TaskStateSchema = Type.Union(
  [
    Type.Literal("not-started"),
    Type.Literal("in-progress"),
    Type.Literal("done"),
  ],
  { description: "Task state" },
);

export const LoadTodoListParameters = Type.Object(
  {
    markdown: Type.String({
      minLength: 1,
      description: "Markdown content containing the task list.",
    }),
  },
  { additionalProperties: false },
);

export const UpdateTodoTaskParameters = Type.Object(
  {
    taskId: Type.String({
      minLength: 1,
      description: "Stable task ID from the todo widget.",
    }),
    state: TaskStateSchema,
  },
  { additionalProperties: false },
);

export const ClearTodoListParameters = Type.Object(
  {
    confirm: Type.Boolean({
      description: "Must be true to clear the list and delete state.",
    }),
  },
  { additionalProperties: false },
);
