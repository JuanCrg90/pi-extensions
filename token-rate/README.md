# Token Rate Extension

Displays real-time tokens/sec in the status line while the model is generating a response.

## What it shows

- **Live rate** — tokens/sec based on recent streaming activity (smoothed to reduce jitter)
- **Average rate** — overall average from the start of generation
- **Total tokens** — cumulative token count
- **Elapsed time** — how long the model has been generating

## Installation

### Global (all projects)

```bash
cp -r token-rate ~/.pi/agent/extensions/token-rate
```

Then restart pi. The extension auto-discovers on startup.

### Project-local

```bash
cp -r token-rate .pi/extensions/token-rate
```

Trust the project when prompted, then restart pi.

### Quick test (CLI flag)

```bash
pi -e ./token-rate
```

## How it works

Subscribes to the `message_update` event, which fires for each token streamed by the model. It tracks the token count and calculates the rate since the last update, blending it with the previous rate to keep the display smooth.

When generation ends (`message_end`), a final summary is shown briefly before clearing.
