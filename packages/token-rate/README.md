# 🚀 Token Rate Tracker

A real-time performance monitor for your AI interactions within [pi](https://github.com/earendil-works/pi-mono).

The **Token Rate** extension provides a live dashboard showing and calculating inference metrics as the model generates text. Instead of waiting until the end of a message to see how "fast" it was, you can watch the token flow in real-time.

## 🎬 Demo

https://github.com/user-attachments/assets/fa5dcd89-fc8f-4aa8-a553-7423d2c00109

## ✨ Features

-   **Live Metrics**: Displays current throughput (tokens/sec) and cumulative averages while the model is streaming.
-   **Smooth Tracking**: Uses a weighted moving average to provide a stable "current speed" even during network fluctuations or inference spikes.
-   **Summary View**: Automatically switches to a detailed summary at the end of each message, showing total tokens used and actual elapsed time.
-   **Native TUI Integration**: Built using official `@earendil-works/pi-tui` components (`DynamicBorder`, `Container`, `Text`), ensuring perfect theme compatibility.
-   **Easy Toggle**: Quickly show or hide the stats with a hotkey (or slash command) to keep your workspace clean when not needed.

## 📦 Installation & Distribution

### Method 1: `pi install` (Recommended)

Install directly from npm:

```bash
pi install npm:@juancrg90/token-rate
```

Or install directly from this GitHub repository:

```bash
pi install git:github.com/JuanCrg90/pi-extensions@main#packages/token-rate
```

> **Note:** Use `pi install -l ...` to install for the current project only. Without `-l`, the package is installed globally (`~/.pi/agent/`).

### Method 2: Local Installation (Manual)

For development or simple use cases, place the extension folder in the standard discovery path:

```bash
# For a global installation (available in all sessions):
mkdir -p ~/.pi/agent/extensions/token-rate
cp -r ./path/to/packages/token-rate/* ~/.pi/agent/extensions/token-rate/

# For a project-local installation:
mkdir -p .pi/extensions/token-rate
cp -r ./path/to/packages/token-rate/* .pi/extensions/token-rate/
```

## 🛠 Tech Stack & Best Practices

This extension is built following the official **Pi-TUI Standardized Patterns** to ensure high performance and theme support:

*   **Theme-aware Rendering**: Uses the **Factory Pattern** (`(tui, theme) => ...`) to ensure colors adapt instantly when the user changes themes.
*   **Component Composition**: Uses `DynamicBorder` and `Container` to maintain a clean, consistent look with the rest of the Pi interface.
*   **Performance Caching**: Implements standard `render()` caching to minimize TUI overhead during rapid token streaming.

## ⚙️ Configuration

The widget is **enabled by default**. To customize behavior, create
`~/.pi/agent/token-rate.json`:

```json
{
  "widgetVisible": true
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `widgetVisible` | boolean | `true` | Whether the widget appears during streaming |

Omit the file or the `widgetVisible` key to use the default (`true`). Set to
`false` to disable the widget entirely.

Changes take effect on the next session start or after `/reload`.

## 🎮 Usage

### Slash Commands
Toggle the visibility of the performance dashboard:
*   `/toggle-token-rate` - Show/Hide the stats widget.

### Shortcuts
*   `Ctrl + Shift + T` - Toggle the statistics dashboard instantly.

> **tmux note:** `Ctrl + Shift + letter` shortcuts may not be forwarded reliably by some `tmux` + terminal setups. If the shortcut does not work inside `tmux`, verify your terminal/tmux extended key support (for example `set -g xterm-keys on`) or use `/toggle-token-rate` instead.

### Visuals
When active, you will see a styled box above or below the main interaction area showing:
- **Current**: The current flow speed.
- **Average**: Overall average of the current response.
- **Tokens**: Total tokens in the current turn.
- **Elapsed/Summary**: Time elapsed and session totals after completion.

## 🏗 Package Structure

```
token-rate/
├── package.json    # Pi package manifest (pi.extensions field)
├── src/
│   └── index.ts    # Extension entry point
├── index.ts        # Root re-export for `pi -e ./token-rate`
├── README.md
└── .gitignore
```

## 📋 Prerequisites

*   [pi](https://github.com/earendil-works/pi-mono) ≥ 0.1.0
*   Node.js (for development only)

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

[MIT](LICENSE) © JuanCrg90

---
*Built with ❤️ for the Pi ecosystem.*
*Part of the [pi-extensions](https://github.com/JuanCrg90/pi-extensions) mono-repo.*
