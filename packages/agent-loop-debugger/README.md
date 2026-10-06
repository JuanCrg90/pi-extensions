# Agent Loop Debugger

A Pi extension that exposes a `/agentloop` command. Running it starts a small
local web server that serves a real-time debugger, streaming Pi agent lifecycle
events into a browser-based timeline.

![Agent Loop Debugger timeline with expanded tool execution event](screenshots/agent-loop-debugger.png)

## Installation

```bash
pi install npm:@juancrg90/agent-loop-debugger
```

Or test locally:

```bash
pi -e ./packages/agent-loop-debugger
```

## Usage

Inside Pi, run:

```
/agentloop
```

The command toggles the debugger server on and off. When started, it prints a
local URL such as `http://127.0.0.1:54321`. Open that URL in a browser to see
live events.

### Webapp controls

- **Category toggles** — show or hide events by category.
- **Auto-scroll** — automatically scroll to the newest event; pause if you scroll up manually.
- **Export trace** — download the currently buffered events as `agent-loop-trace-<timestamp>.json`.
- **Clear** — clear the timeline display without affecting the server buffer.

## Event categories

- **session** — session start/shutdown and related session events.
- **agent** — agent loop lifecycle, turns, and message start/end.
- **prompt** — context assembly and assistant message streaming updates.
- **tool** — tool calls, execution, and results.
- **provider** — provider request/response events.

Events are normalized to a common schema:

```ts
{
  id: string;
  timestamp: number;
  category: "agent" | "tool" | "prompt" | "provider" | "session";
  type: string;
  summary: string;
  payload: unknown;
}
```

The server keeps the last 1000 events in memory and replays them to new
browser connections before streaming live events.

### Known event caveats

The current Pi API (`@earendil-works/pi-coding-agent`) does not expose the
following event names mentioned in the original intent:

- `agent_before_settle`
- `provider_stream_event`
- `context_with_system`

The extension registers the available equivalents instead:

- `agent_settled`
- `before_provider_request` / `after_provider_response`
- `context`

## Development

```bash
pnpm --filter @juancrg90/agent-loop-debugger typecheck
pnpm --filter @juancrg90/agent-loop-debugger test
```

## License

MIT
