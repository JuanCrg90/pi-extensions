# Intent: Agent Loop Debugger

## Confirmed Intent

A distributable Pi extension that adds a `/agentloop`-style command. Running it starts a small local web server serving a real-time debugger that streams Pi lifecycle events into a scannable, filterable timeline.

## What It Does

- Streams Pi agent lifecycle events to an external webapp in real time.
- Event categories covered:
  - Agent lifecycle: turn start/end, message start/update/end, before settle/settled.
  - Tool execution: tool call, arguments, nested tool execution, tool results.
  - Prompt/context: system prompt assembly, context messages, active tool changes, skills/project context.
  - Provider stream events.
- Shows compact event summaries by default; clicking expands to the full raw payload.
- Provides category toggles to reduce noise.
- Keeps a bounded in-memory buffer for the current session.
- Allows optional export of the captured trace.

## User

You, debugging or learning how Pi behaves turn-by-turn.

## Success

You can run a command, open a browser, watch events appear live as Pi works, toggle categories to reduce noise, click an event to see its full payload, and optionally export a bounded trace.

## Constraints

- Observe-only in the first version.
- No pause/step/control of the loop.
- Webapp first; TUI panel is out of scope for v1.

## Out of Scope

- Persistent cross-session history.
- TUI panel.
- Modifying Pi behavior.
- Production-grade auth or multi-user support.
