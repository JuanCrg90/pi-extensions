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

### Tools

- **LoadTodoList** — load a markdown task list into the widget.
- **UpdateTodoTask** — mark a task as `not-started`, `in-progress`, or `done`. Task IDs are stable, derived from the group and item text.
- **ClearTodoList** — clear the widget and delete persisted state.

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

## Persistence

State is saved in `.pi/todo-widget-state.json` inside the current project. Task states and collapsed groups are restored when the list is reloaded.

## Development

```bash
pnpm install
pnpm --filter @juancrg90/todo-widget test
```

## License

MIT © JuanCrg90
