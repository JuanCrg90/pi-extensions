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
- 2–4 options per question
- unique, non-blank `question.id`
- unique, non-blank `option.id` within each question
- IDs beginning with `$` and the internal `__other__` ID are reserved
- question text must end with `?`
- header must be non-blank and no longer than 12 characters
- labels and descriptions must be non-blank; labels must be unique per question
- explicit `Other` / `Other...` options are forbidden; the tool auto-adds one
- preview is allowed only on single-select questions
- at most one option per question may set `recommended: true`

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
  questionNotes?: string;
  optionNotes?: Record<string, string>; // option.id or "$other"
  selectedPreview?: string;
}
```

The complete structured result is included in model-visible tool content as
well as tool details. Follow-up responses can therefore use answers, notes,
preview context, and preserved metadata without reading TUI-only state.

## Runtime behavior

- one-question flow submits immediately after answer
- multi-question flow enters review once all required questions are answered
- optional questions may remain unanswered
- multi-select `Space` immediately updates answered state; empty selection needs two `Enter` presses
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
- `←/→` — switch questions; move picker during review
- `Space` — toggle focused option in multi-select
- `Enter` — confirm / submit current action
- `o` — open `Other...` input
- `n` — edit note for focused option
- `N` — edit note for the current question
- `?` — open help
- `Esc`, `Esc` — dismiss to chat
- `Ctrl-C` — dismiss immediately

Help:
- any key closes help

Other... / note input:
- uses Pi TUI's native single-line `Input` control
- type or paste plain text; Unicode and terminal paste are supported
- `←/→`, `Home`, and `End` move the cursor
- `Enter` saves
- `Esc` cancels without overwriting the saved value
- configured Pi editor bindings handle deletion, word movement, and undo

## TUI

The dialog uses Pi's native `Container`, `Text`, `Box`, `Input`, and
`DynamicBorder` controls. It follows the active Pi theme for headings, focus,
selections, warnings, descriptions, controls, and borders.

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
