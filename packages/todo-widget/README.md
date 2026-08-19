# @juancrg90/todo-widget

Persistent accordion-style todo list widget for [pi](https://github.com/earendil-works/pi-mono). Display task groups from a markdown checklist and update task state as the agent works.

## Install

```bash
pi install npm:@juancrg90/todo-widget
```

## Usage

The agent loads a markdown checklist with the `LoadTodoList` tool, then updates individual tasks with `UpdateTodoTask`. The widget appears in the TUI and persists state across pi restarts for the current project.

### Markdown format

```markdown
# Project: Turnstile integration

## Task 1: Setup

- [ ] Confirmar Wrangler canónico
- [x] Ejecutar auth probe
- [/] Verificar dashboard

## Task 2: Verify

- [ ] Probar rechazo de token
- [ ] Implementar helper
```

- First `#` heading is the project title.
- Second-level `##` headings are task groups.
- Task markers:
  - `- [ ]` not-started
  - `- [/]` in-progress
  - `- [x]` done

### Task IDs

Task IDs are stable and derived from the markdown text: `<group-slug>:<item-slug>`. For example, a task under `## Task 1: Setup` with item `- [ ] Confirm env` gets ID `task-1-setup:confirm-env`. The `LoadTodoList` and `ListTodoTasks` tools return the exact IDs for each task. Use those exact IDs in `UpdateTodoTask`; passing an unknown ID returns an error.

### Tools

- **LoadTodoList** — load a markdown task list into the widget.
- **ListTodoTasks** — return the current list with exact task IDs.
- **UpdateTodoTask** — mark a task as `not-started`, `in-progress`, or `done`. Use the IDs returned by `LoadTodoList` or `ListTodoTasks`.
- **ClearTodoList** — clear the widget and delete persisted state. Only call this when the user explicitly asks to clear the list; do not call it automatically when a plan finishes.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `ctrl+shift+l` | Toggle widget visibility |
| `ctrl+shift+o` | Expand all groups |
| `ctrl+shift+c` | Collapse all groups |
| `ctrl+shift+[` / `ctrl+shift+]` | Focus previous / next group |
| `ctrl+shift+return` | Toggle focused group |

### Slash commands

- `/toggle-todo-widget`
- `/expand-todo-groups`
- `/collapse-todo-groups`
- `/clear-todo-list` (asks for confirmation)

### Known limitation: no mouse support

Clicking a group header to expand/collapse is not supported. Pi does not currently dispatch mouse events to extensions or widgets: the TUI's viewport layer consumes all mouse input for scrolling, text selection, and scrollbar drags, and extension input listeners never see mouse sequences. Widget components only receive keyboard input. This is tracked upstream as [earendil-works/pi#7683](https://github.com/earendil-works/pi/issues/7683); once pi exposes mouse events to components, the widget can be wired for click-to-toggle.

Until then, use the keyboard shortcuts or slash commands above.

## Persistence

State is saved in `.pi/todo-widget-state.json` inside the current project. Group and task titles, task states, and collapsed groups are restored automatically when pi starts a session in the same project. Loading a markdown list with a different `#` project title resets persisted task state so progress from an unrelated plan does not leak across lists.

## Keeping the widget in sync

The widget is TUI-only, so agents can forget to update it. This extension enforces sync on three layers:

1. **Status in context** — while a list is loaded, a compact `[TodoWidget]` block with pending/in-progress tasks and their exact IDs is injected into every LLM call. The model always sees what is left and what IDs to use.
2. **Completion nudge** — when an agent run settles with unfinished tasks, a work tool was used, the final message sounds complete, and no `UpdateTodoTask` was called, the extension injects a follow-up message that forces a reconciliation turn (`ListTodoTasks` + `UpdateTodoTask`). Loop-guarded: follow-up runs are never re-nudged, and runs that already updated the widget are skipped.
3. **Prompt guidelines** — `UpdateTodoTask`, `LoadTodoList`, and `ListTodoTasks` carry imperative guidelines that name each tool explicitly.

The nudge can be disabled with the `TODO_WIDGET_NO_NUDGE=1` environment variable; the status-in-context layer stays on.

## Development

```bash
pnpm install
pnpm --filter @juancrg90/todo-widget test
pnpm --filter @juancrg90/todo-widget typecheck
```

## License

MIT © JuanCrg90
