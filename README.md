# 🚀 pi-extensions

Mono-repo for [pi](https://github.com/earendil-works/pi-mono) extensions — a collection of high-quality, open-source extensions for the Pi AI assistant.

## 📦 Available Packages

| Package | Type | Description | Install |
|---------|------|-------------|---------|
| **token-rate** | Extension | Real-time token rate tracker — displays tokens/sec while the model generates | `pi install npm:@juancrg90/token-rate` |
| **dracula-themes** | Theme pack | Dracula Classic (`dracula`) + Alucard Classic (`alucard`) for Pi | `pi install npm:@juancrg90/dracula-themes` |
| **nightfox-themes** | Theme pack | Nightfox collection (7 themes: dark + light) for Pi | `pi install npm:@juancrg90/nightfox-themes` |

## 🏗 Structure

```
pi-extensions/
├── packages/
│   ├── token-rate/
│   │   ├── package.json
│   │   ├── src/
│   │   ├── index.ts
│   │   └── README.md
│   ├── dracula-themes/
│   │   ├── package.json
│   │   ├── screenshots/
│   │   ├── themes/
│   │   └── README.md
│   ├── nightfox-themes/
│   │   ├── package.json
│   │   ├── screenshots/
│   │   ├── themes/
│   │   └── README.md
│   └── ...
├── package.json        # Root workspace config
├── pnpm-workspace.yaml
└── README.md
```

Each extension is an independent npm package. Use `pi install npm:<package-name>` to install any extension.

## 🤝 Contributing

Pull requests are welcome! To publish a new extension:

1. Create a new folder under `packages/`
2. Add a `package.json` with `pi.extensions` and `peerDependencies`
3. Add a `README.md` with installation instructions
4. Submit a PR

## 📄 License

[MIT](LICENSE) © JuanCrg90
