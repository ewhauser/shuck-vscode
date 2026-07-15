# Shuck for Visual Studio Code

Fast shell linting, formatting, and editor intelligence powered by
[Shuck](https://github.com/ewhauser/shuck).

The extension connects VS Code to the language server included in the `shuck`
command. It supports Bash, POSIX shell, zsh, and ksh documents locally and in
remote extension hosts.

## Features

- Live diagnostics for unsaved buffers
- Quick fixes, disable-line actions, and fix all
- Whole-document and range formatting
- Completion and symbol hover
- Go to definition, references, and document highlights
- Document and workspace symbols
- Incoming and outgoing call hierarchy
- Conservative same-file rename
- Automatic `.shuck.toml` and `shuck.toml` reload
- Multi-root workspace settings

The server advertises capabilities dynamically, so VS Code only enables
features implemented by the installed Shuck version.

## Requirements

Install Shuck `0.0.43` or newer in the same environment where the VS Code
extension host runs:

```sh
brew install ewhauser/tap/shuck
```

Other supported installation methods:

```sh
pip install shuck-cli
cargo install shuck-cli
```

Confirm the executable is available:

```sh
shuck --version
```

Remote SSH, dev-container, and Codespaces windows need Shuck installed in the
remote environment. Set `shuck.server.path` if it is not on that environment's
`PATH`.

## Settings

Process settings are machine-scoped. A workspace cannot replace the executable
or inject process arguments and environment values.

| Setting                                |      Default | Description                      |
| -------------------------------------- | -----------: | -------------------------------- |
| `shuck.server.path`                    |      `shuck` | Executable name or path          |
| `shuck.server.arguments`               | `["server"]` | Language-server arguments        |
| `shuck.server.environment`             |         `{}` | Additional process environment   |
| `shuck.server.logFile`                 |        empty | Optional native server log       |
| `shuck.server.logLevel`                |       `warn` | Native server log level          |
| `shuck.fixAll`                         |       `true` | Enable `source.fixAll.shuck`     |
| `shuck.unsafeFixes`                    |      `false` | Offer behavior-changing fixes    |
| `shuck.showSyntaxErrors`               |      `false` | Show parser recovery diagnostics |
| `shuck.workspaceSymbols.enabled`       |       `true` | Index workspace symbols          |
| `shuck.workspaceSymbols.maxFiles`      |       `5000` | Closed-file indexing cap         |
| `shuck.completion.includeRuntimeNames` |       `true` | Complete runtime names           |
| `shuck.completion.includeKeywords`     |       `true` | Complete shell keywords          |
| `shuck.trace.server`                   |        `off` | LSP protocol tracing             |

Project lint rules, dialects, ignores, exclusions, and formatting policy belong
in `.shuck.toml` or `shuck.toml`, where the CLI and every editor share them.

## Commands

Open the Command Palette and use:

- `Shuck: Start Language Server`
- `Shuck: Stop Language Server`
- `Shuck: Restart Language Server`
- `Shuck: Show Output`
- `Shuck: Show Server Status`
- `Shuck: Open Settings`

## Troubleshooting

If the server cannot start:

1. Run `shuck --version` in a terminal attached to the same local or remote
   environment.
2. Set `shuck.server.path` to the executable's absolute path.
3. Run `Shuck: Restart Language Server`.
4. Open `Shuck: Show Output` for launch and protocol details.

Both protocol traces and native server logs may contain source text and local
paths. Review them before sharing.

## Development

Node 22 or newer is required for the development toolchain.

```sh
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host. The complete
design and verification contract is in
[`specs/001-vscode-extension.md`](specs/001-vscode-extension.md).

## Privacy

The extension collects no telemetry and makes no runtime network requests. It
only starts the configured local Shuck process and communicates with it over
stdio.

## License

MIT
