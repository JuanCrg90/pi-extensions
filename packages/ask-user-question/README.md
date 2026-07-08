# AskUserQuestion Extension

Interactive question tool for Pi — pause the agent flow, ask structured questions in the TUI, collect answers with stable ID-based results.

## Install

```bash
pi install npm:@juancrg90/ask-user-question
```

## Tool: `AskUserQuestion`

Let the agent pause execution and ask the user one or more structured questions in the TUI.

### When to use

- User preference materially changes the outcome
- Multiple valid implementation paths exist
- Ambiguity cannot be resolved from context
- Batching related decisions is more efficient than serial follow-ups

### When not to use

- Asking for permission on risky actions
- Asking for plan approval already covered by another flow
- Answer can be inferred confidently from context

### Parameters

```typescript
interface AskUserQuestionParams {
  questions: Question[];
  metadata?: {
    source?: string;
    flowId?: string;
    tags?: string[];
  };
}

interface Question {
  id: string;           // Required, unique within call
  question: string;     // Must end with '?'
  header: string;       // Max 12 chars
  multiSelect?: boolean;
  options: Option[];    // 2–4 options per question
  required?: boolean;   // Default: true
}

interface Option {
  id: string;           // Required, unique within question
  label: string;
  description: string;
  preview?: string;     // Only on single-select questions
  recommended?: boolean;
}
```

### Input rules

| Rule | Detail |
|------|--------|
| Questions | 1–8 per call |
| Options | 2–4 per question |
| IDs | Required and unique (`question.id`, `option.id`) |
| Question text | Must end with `?` |
| Header | Max 12 characters |
| Other | Auto-added by the tool; never include it in input |
| Preview | Only on single-select questions |

### Output

```typescript
interface AskUserQuestionResult {
  cancelled: boolean;
  answers?: Record<string, AnswerValue>;     // keyed by question.id
  annotations?: Record<string, QuestionAnnotations>; // keyed by question.id
  metadata?: { source?: string; flowId?: string };
}
```

Single-select answer:

```typescript
{
  kind: "single",
  optionId?: string,
  label: string,
  other?: boolean,
  text?: string
}
```

Multi-select answer:

```typescript
{
  kind: "multi",
  selections: Array<{ optionId?: string; label: string; other?: boolean; text?: string }>,
  empty: boolean
}
```

### Keybindings

| Key | Action |
|-----|--------|
| `↑/↓` or `j/k` | Move focus between options |
| `Tab` / `Shift+Tab` | Move to next/previous question |
| `Space` | Toggle focused option (multi-select) |
| `Enter` | Confirm current question selection |
| `o` | Open "Other..." text input |
| `n` | Add/edit notes for focused option |
| `?` | Open help overlay |
| `Esc` | First press: show warning. Second press: dismiss |
| `Ctrl-C` | Dismiss immediately |

### Example

```typescript
// Agent calls:
AskUserQuestion({
  questions: [
    {
      id: "framework",
      question: "Which frontend framework do you prefer?",
      header: "Framework",
      options: [
        { id: "react", label: "React", description: "Component-based UI library", recommended: true },
        { id: "vue", label: "Vue", description: "Progressive JavaScript framework" },
        { id: "svelte", label: "Svelte", description: "Compiler-based approach" }
      ]
    }
  ]
})
```

### Example result

```json
{
  "cancelled": false,
  "answers": {
    "framework": {
      "kind": "single",
      "optionId": "react",
      "label": "React"
    }
  }
}
```

## License

MIT © JuanCrg90
