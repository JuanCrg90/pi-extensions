# Implementation Plan: Agent Loop Debugger

## Overview

Build a new Pi extension package `packages/agent-loop-debugger/` that exposes a `/agentloop` command. The command starts a local HTTP server that serves a vanilla-JS webapp and streams Pi lifecycle events via Server-Sent Events (SSE). The webapp renders a live, filterable event timeline with expandable full-payload inspection and optional trace export.

## Architecture Decisions

- **SSE over WebSocket:** The data flow is server → client only, so SSE is simpler and requires no extra dependency. The built-in `node:http` server can serve both static files and the `/events` endpoint.
- **Vanilla JS webapp:** No build step keeps the extension self-contained and easy to distribute. A single `index.html` embeds CSS and JS.
- **In-memory bounded buffer:** The extension keeps the last N events (e.g., 1000) in memory. On browser connect, it replays the buffered events so the viewer can see recent history.
- **Category toggles in the UI:** The backend sends a `category` field with each event; the frontend filters display. This keeps backend logic simple.
- **Observe-only v1:** No blocking or mutation of events; handlers are notification-only.

## Task List

### Phase 1: Foundation

- [ ] Task 1: Scaffold the extension package
  - Create `packages/agent-loop-debugger/package.json`, `index.ts`, `src/index.ts`, `src/server.ts`, `src/events.ts`, `public/index.html`, and `README.md`.
  - Match existing package patterns (`@juancrg90/agent-loop-debugger`, `pi.extensions`, peer deps).

- [ ] Task 2: Implement the event collector
  - Register `pi.on()` handlers for relevant lifecycle events.
  - Normalize each event into a common schema: `{ id, timestamp, category, type, summary, payload }`.
  - Maintain a bounded ring buffer (max 1000 events) and a simple pub/sub for new events.

- [ ] Task 3: Implement the HTTP/SSE server
  - Serve `public/index.html` at `/`.
  - Serve captured events at `/events` using SSE.
  - Replay buffered events on connect, then stream new events.
  - Provide a clean start/stop lifecycle tied to the `/agentloop` command.

### Checkpoint: Foundation

- [ ] Extension loads without errors.
- [ ] Running `/agentloop` starts a server on a local port.
- [ ] Opening the served page shows an empty or minimal UI.

### Phase 2: Core Features

- [ ] Task 4: Build the webapp timeline UI
  - Render events as a scrollable list with timestamp, category badge, type, and summary.
  - Add category toggle buttons.
  - Implement click-to-expand for full payload JSON.

- [ ] Task 5: Verify end-to-end event flow
  - Run Pi with the extension, start `/agentloop`, open the webapp, and send a user message.
  - Confirm lifecycle events appear in real time.

- [ ] Task 6: Add trace export
  - Add a button to download the currently buffered events as JSON.

### Checkpoint: Core Features

- [ ] Live events appear in the webapp.
- [ ] Category toggles work.
- [ ] Export produces a valid JSON file.

### Phase 3: Polish & Distribution

- [ ] Task 7: Add tests
  - Unit tests for event normalization and ring buffer.
  - Optionally a small test for the SSE endpoint.

- [ ] Task 8: Finalize README and monorepo integration
  - Document installation (`pi install npm:@juancrg90/agent-loop-debugger`), usage, and event categories.
  - Add publish script to root `package.json`.

### Checkpoint: Complete

- [ ] All tests pass.
- [ ] Build/typecheck clean.
- [ ] README is complete.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Some desired events are notification-only or lack the fields we expect | Medium | Inspect Pi event types early; normalize gracefully and document any gaps. |
| SSE connections drop or events are lost on reconnect | Low | Buffer events server-side and replay on connect. |
| Payloads are too large for the bounded buffer | Medium | Truncate very large payloads in summaries; keep full payload for expansion but bound total memory. |
| Browser security blocks the local server | Low | Bind to `127.0.0.1`; document that users may need to allow localhost. |

## Open Questions

- Which exact port should the server use? (Default to 0 for ephemeral, print the URL.)
- Should the command open the browser automatically? (Defer to v2; print URL for v1.)
