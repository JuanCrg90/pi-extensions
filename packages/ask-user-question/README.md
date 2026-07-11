# AskUserQuestion

Interactive Pi tool. Pause agent flow. Ask structured questions in TUI. Return stable ID-keyed answers.

## Install

```bash
pi install npm:@juancrg90/ask-user-question
```

## Tool

`AskUserQuestion`

Use when:
- user preference changes outcome
- multiple valid paths
- ambiguity not inferable from repo/context
- batching related choices better than serial follow-ups

Do not use when:
- asking permission for risky actions
- plan approval already covered elsewhere
- answer inferable with high confidence

## Input

```ts
interface AskUserQuestionParams {
  questions: Question[];
  metadata?: {
    source?: string;
    flowId?: string;
    tags?: string[];
  };
}

interface Question {
  id: string;
  question: string;   // must end with ?
  header: string;     // max 12 chars
  multiSelect?: boolean;
  required?: boolean; // default true
  options: Option[];  // 2–4 options
}

interface Option {
  id: string;
  label: string;
  description: string;
  preview?: string;   // single-select only
  recommended?: boolean;
}
```

Rules:
- 1–8 questions
- unique `question.id`
- unique `option.id` within each question
- explicit `Other` forbidden; tool auto-adds `Other...`
- preview allowed only on single-select

## Output

```ts
interface AskUserQuestionResult {
  cancelled: boolean;
  answers?: Record<string, AnswerValue>;      // keyed by question.id
  annotations?: Record<string, QuestionAnnotations>;
  metadata?: { source?: string; flowId?: string };
}

type AnswerValue =
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

interface QuestionAnnotations {
  questionNotes?: string;            // reserved in schema; no dedicated editor yet
  optionNotes?: Record<string, string>; // option.id or "$other"
  selectedPreview?: string;
}
```

## Runtime behavior

- one-question flow submits immediately after answer
- multi-question flow enters review/submit tab after all answered
- dismiss path returns `cancelled: true` and `terminate: true`
- working indicator hidden while modal open; always restored
- supports external abort via `_signal`
- emits low-noise `_onUpdate` milestones:
  - `dialog_opened`
  - `question_answered`
  - `review_ready`
  - `submitted`
  - `dismissed`

## Keybindings

Normal:
- `↑/↓` or `j/k` — move focus
- `Tab` / `Shift+Tab` — switch questions
- `←/→` — move review picker
- `Space` — toggle focused option in multi-select
- `Enter` — confirm / submit current action
- `o` — open `Other...` input
- `n` — edit note for focused option
- `?` — open help
- `Esc`, `Esc` — dismiss to chat
- `Ctrl-C` — dismiss immediately

Help:
- any key closes help

Other... / note input:
- type plain text
- `Enter` save
- `Esc` cancel
- `Backspace` delete

## Preview

- single-select only
- plain text only
- wide terminals: side-by-side option list + preview
- narrow terminals: preview stacked below list
- if focused option has no preview, explicit `(no preview)` shown

## Example input

```ts
AskUserQuestion({
  questions: [
    {
      id: "framework",
      question: "Which frontend framework do you prefer?",
      header: "Framework",
      options: [
        {
          id: "react",
          label: "React",
          description: "Component-based UI library",
          preview: "Best if you want broad ecosystem support.",
        },
        {
          id: "vue",
          label: "Vue",
          description: "Progressive framework",
          preview: "Good default if you want gentle adoption.",
        },
      ],
    },
  ],
});
```

## Example result

```json
{
  "cancelled": false,
  "answers": {
    "framework": {
      "kind": "single",
      "optionId": "react",
      "label": "React"
    }
  },
  "annotations": {
    "framework": {
      "selectedPreview": "Best if you want broad ecosystem support."
    }
  }
}
```

## Security

Do not pass secrets in question text, descriptions, previews, or notes.

## License

MIT
