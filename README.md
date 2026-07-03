# 🚀 pi-extensions

Mono-repo for [pi](https://github.com/earendil-works/pi-mono) extensions — a collection of high-quality, open-source extensions for the Pi AI assistant.

## 📦 Available Extensions

| Package | Description | Install |
|---------|-------------|---------|
| **token-rate** | Real-time token rate tracker — displays tokens/sec while the model generates | `pi install npm:@juancrg90/token-rate` |

## 🏗 Structure

```
pi-extensions/
├── packages/
│   ├── token-rate/
│   │   ├── package.json
│   │   ├── src/
│   │   ├── index.ts
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
