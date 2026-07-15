# 001: Visual Studio Code Extension

## Status

Implemented

## Summary

Build and publish a first-party Visual Studio Code extension for Shuck from the
standalone `ewhauser/shuck-vscode` repository. The extension is a thin,
desktop/remote extension-host client for the Language Server Protocol (LSP)
implementation shipped by the `shuck` executable. It discovers and validates a
user-installed executable, launches `shuck server` over stdio, forwards
workspace-scoped editor options, exposes lifecycle and troubleshooting
commands, and lets the language server provide diagnostics, fixes, formatting,
completion, navigation, symbols, hover, call hierarchy, and rename.

The extension does not reimplement shell analysis, bundle a Shuck binary, or
download executable code in its first release. Project lint and format policy
continues to live in `.shuck.toml` or `shuck.toml`; VS Code settings cover the
server process and editor-only behavior.

## Motivation

Shuck already ships a capable stdio language server, but using it in VS Code
currently requires users to install and configure a generic LSP client. That
setup is difficult to discover and cannot provide Shuck-specific executable
validation, settings, status, restart behavior, installation guidance, or
Marketplace distribution.

A first-party extension gives VS Code users a one-install editor integration
while preserving the language server as the single implementation of shell
semantics. Keeping the extension in its own repository separates the
TypeScript, npm, VSIX, Marketplace, and VS Code compatibility lifecycle from
the Rust workspace and Cargo release process. The two projects communicate
only through the versioned LSP surface exposed by `shuck server`.

## Design

### Goals

- Activate for supported shell documents and start one Shuck language-server
  process per VS Code extension host.
- Work in local windows, SSH/dev-container/Codespaces remote windows, and
  multi-root workspaces.
- Use the full standard LSP capability surface advertised by the server
  without duplicating providers in TypeScript.
- Find `shuck` on `PATH` by default and support an explicit machine-local
  executable path, server arguments, and environment overrides.
- Validate that the configured command can start before constructing the LSP
  client and give actionable installation/configuration errors.
- Send initialization and dynamic configuration in the shape accepted by
  Shuck, including per-workspace-folder options.
- Expose start, stop, restart, output, status, and settings commands.
- Make server state visible in a status-bar item and an output channel.
- Package a reproducible VSIX and provide CI and release workflows.
- Collect no telemetry and make no network requests at runtime.

### Non-Goals

- Implementing lint, formatting, completion, navigation, symbol, hover, call
  hierarchy, or rename logic in the extension.
- Supporting web-only VS Code hosts. `shuck server` is a native process and
  requires a Node-capable extension host.
- Automatically installing, updating, or downloading the `shuck` executable.
- Bundling platform-specific Shuck binaries in the VSIX.
- Editing project lint/format policy through a custom UI. Users edit
  `.shuck.toml` or `shuck.toml` directly.
- Registering a new shell language grammar or replacing VS Code's built-in
  shell language support.
- Supporting embedded shell inside YAML through the extension. That requires
  the language server to advertise and map the host document.
- Publishing the initial repository commit to the Marketplace. Marketplace
  publication requires a separately provisioned publisher token.

### Compatibility Contract

The extension requires VS Code `^1.91.0`, matching the minimum supported by
`vscode-languageclient` 10.x. The initial extension version is `0.1.0` and its
fully supported server baseline is Shuck `0.0.43`.

Before starting the server, the extension first runs:

```text
<configured executable> --version
```

The probe has a five-second timeout and inherits the configured process
environment. If the command succeeds and output contains a recognizable Shuck
semantic version older than the baseline, startup is blocked with an upgrade
message. Shuck `0.0.43` does not expose a version flag, so a non-zero version
probe falls back to:

```text
<configured executable> <configured server arguments> --help
```

Startup proceeds when that fallback succeeds. A missing executable or failure
of both probes prevents startup. Unrecognized successful version output is
logged and allowed so development wrappers and test servers remain usable.

Newer servers are accepted. LSP capability negotiation, rather than extension
version checks, determines which editor features VS Code enables. The extension
must not assume a server capability that was not advertised.

### Repository Layout

```text
shuck-vscode/
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   └── tasks.json
├── scripts/
│   └── build.mjs
├── specs/
│   └── 001-vscode-extension.md
├── src/
│   ├── configuration.ts
│   ├── controller.ts
│   ├── extension.ts
│   ├── process.ts
│   ├── server.ts
│   ├── settings.ts
│   ├── version.ts
│   └── test/
│       ├── fixtures/fake-server.cjs
│       ├── runTest.ts
│       ├── suite/extension.test.ts
│       └── unit/{process,settings,version}.test.ts
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── eslint.config.mjs
├── package.json
├── package-lock.json
├── tsconfig.json
└── tsconfig.test.json
```

`dist/` contains the bundled extension entrypoint and source map. `out/`
contains compiled test code. Both are generated and ignored by Git, but the
release workflow builds `dist/` before VSIX packaging.

### Runtime Architecture

```text
VS Code UI
  │ commands, settings, status
  ▼
Shuck extension controller
  │ validates executable and builds configuration
  ▼
vscode-languageclient
  │ JSON-RPC / LSP over stdin and stdout
  ▼
shuck server
  │ reads open buffers and project configuration
  ▼
Shuck parser, semantic model, linter, and formatter
```

The extension owns process lifecycle and protocol transport. The language
client owns standard LSP registration, cancellation, document synchronization,
workspace folders, diagnostics, edits, and progress UI. The server owns all
analysis and decides its capabilities during `initialize`.

### Activation and Document Selection

The package activates on the following language identifiers:

- `shellscript` (VS Code built-in shell language);
- `bash`;
- `sh`;
- `zsh`;
- `ksh`.

It also activates when a user invokes any contributed Shuck command or opens a
workspace containing `.shuck.toml` or `shuck.toml`. The LSP document selector
registers those language identifiers for `file`, `untitled`, and
`vscode-remote` URI schemes.

The extension declares `extensionKind: ["workspace"]`. In a remote window it
runs beside the workspace and resolves `shuck` in that environment. Virtual
workspaces are unsupported because the native server expects filesystem-backed
workspace roots and configuration discovery.

### Process Resolution and Launch

Process settings are machine-scoped so an untrusted repository cannot replace
the command that the extension executes:

| Setting                    | Type     | Default      | Purpose                                                           |
| -------------------------- | -------- | ------------ | ----------------------------------------------------------------- |
| `shuck.server.path`        | string   | `shuck`      | Executable name or absolute path                                  |
| `shuck.server.arguments`   | string[] | `["server"]` | Arguments used for the LSP process                                |
| `shuck.server.environment` | object   | `{}`         | Environment variables layered over the extension-host environment |
| `shuck.server.logFile`     | string   | empty        | Optional native server trace file                                 |
| `shuck.server.logLevel`    | enum     | `warn`       | Native server log level                                           |

A leading `~` in an explicit path expands to the extension host's home
directory. Environment values must be strings. An empty value is passed as an
empty value; it does not delete the inherited variable. The process runs with
`shell: false`, stdio transport, the first workspace folder as its working
directory when present, and the extension host's current working directory
otherwise.

The extension never interprets executable output as shell syntax and never
constructs a command string. Path and arguments remain separate process-spawn
fields on every operating system.

### Configuration Mapping

Editor-specific settings are resource-scoped so folders in a multi-root
workspace may override them:

| VS Code setting                        | Default | Shuck client option                     |
| -------------------------------------- | ------: | --------------------------------------- |
| `shuck.fixAll`                         |  `true` | `fixAll`                                |
| `shuck.unsafeFixes`                    | `false` | `unsafeFixes`                           |
| `shuck.showSyntaxErrors`               | `false` | `showSyntaxErrors`                      |
| `shuck.workspaceSymbols.enabled`       |  `true` | `server.workspaceSymbols.enabled`       |
| `shuck.workspaceSymbols.maxFiles`      |  `5000` | `server.workspaceSymbols.maxFiles`      |
| `shuck.completion.includeRuntimeNames` |  `true` | `server.completion.includeRuntimeNames` |
| `shuck.completion.includeKeywords`     |  `true` | `server.completion.includeKeywords`     |

Protocol tracing uses the conventional `shuck.trace.server` setting with
`off`, `messages`, and `verbose` values. It is handled by
`vscode-languageclient` and written to a dedicated trace output channel.

Lint selectors, ignores, per-file rules, dialects, formatter layout, and
exclusions are intentionally absent from VS Code settings. Those options are
portable project policy and remain in Shuck configuration files.

Initialization options have this shape:

```json
{
  "shuck": {
    "fixAll": true,
    "unsafeFixes": false,
    "showSyntaxErrors": false,
    "server": {
      "workspaceSymbols": { "enabled": true, "maxFiles": 5000 },
      "completion": {
        "includeRuntimeNames": true,
        "includeKeywords": true
      },
      "rename": { "allowCrossFile": false }
    },
    "tracing": { "logLevel": "warn" }
  },
  "workspace": {
    "file:///workspace-a": { "fixAll": false },
    "file:///workspace-b": { "fixAll": true }
  }
}
```

Workspace entries contain the full resolved editor option set for that folder,
not deltas. On a relevant configuration change, the extension sends
`workspace/didChangeConfiguration` with the same payload shape. Changes to the
path, arguments, environment, log file, or native log level require a process
restart; the extension restarts automatically once after the configuration
event. Other settings update the running server without restart.

The server dynamically registers watchers for `.shuck.toml` and `shuck.toml`.
The extension does not register duplicate watchers.

### Language Client

The client identifier is `shuck` and display name is `Shuck Language Server`.
The executable transport field remains unset, which
`vscode-languageclient` treats as stdio without appending a conventional
`--stdio` argument that `shuck server` does not accept. Run and debug use the
same process options. The client receives:

- the supported-shell document selector;
- initialization options from the configuration mapper;
- a user-facing `Shuck` output channel;
- a separate `Shuck Language Server Trace` channel;
- Markdown trust disabled for server-provided content unless the language
  client can prove the content contains no commands;
- the default bounded language-client restart policy for unexpected process
  exits.

The extension does not manually register LSP feature providers. The server's
initialize result controls diagnostics, code actions, completion, hover,
definition, references, document highlights, document/workspace symbols, call
hierarchy, rename, and formatting.

### Lifecycle State Machine

The controller serializes all lifecycle mutations so two commands or a setting
change cannot start or stop the same client concurrently.

```text
stopped ── start ──► starting ── initialized ──► running
   ▲                     │                         │
   │                     └── failure ──► failed   │
   │                                               │
   └────────────── stop / deactivate ◄─────────────┘
                            │
                         restart
                            │
                         starting
```

`start` is idempotent while starting or running. `stop` is idempotent while
stopped. `restart` waits for stop completion before probing and starting a new
process. VS Code deactivation awaits `LanguageClient.stop()` and disposes all
channels, commands, listeners, and status UI.

An unexpected server exit is handled by the language client's bounded default
restart policy. Once that policy gives up, the controller shows the failed
state and leaves manual restart available; it does not create an unbounded
restart loop.

### Commands and Status

The extension contributes these commands:

| Command                          | Behavior                                                   |
| -------------------------------- | ---------------------------------------------------------- |
| `Shuck: Start Language Server`   | Validate and start when stopped or failed                  |
| `Shuck: Stop Language Server`    | Gracefully stop the current client                         |
| `Shuck: Restart Language Server` | Stop, re-read settings, validate, and start                |
| `Shuck: Show Output`             | Reveal the normal output channel                           |
| `Shuck: Show Server Status`      | Show state, command, detected version, and workspace count |
| `Shuck: Open Settings`           | Open Settings filtered to `@ext:ewhauser.shuck`            |

The status bar appears for supported active documents and while the server is
starting, failed, or stopped after activation. It uses these states:

| State    | Text                    | Tooltip/action                                 |
| -------- | ----------------------- | ---------------------------------------------- |
| starting | `$(sync~spin) Shuck`    | Starting; click to show output                 |
| running  | `$(check) Shuck`        | Running and detected version; click for status |
| stopped  | `$(circle-slash) Shuck` | Stopped; click to start                        |
| failed   | `$(error) Shuck`        | Last error; click to show output               |

Expected user errors are reported once with concise actions:

- executable not found: installation guide and path setting;
- version too old: Shuck release page and output;
- launch/initialization failure: output and restart;
- invalid environment configuration: settings.

### Packaging

TypeScript is checked with strict compiler options. esbuild produces one
CommonJS Node extension bundle and externalizes the `vscode` module. Runtime
dependencies are bundled so the VSIX does not ship a mutable `node_modules`
tree.

The Marketplace package contains only the bundle, source map, README,
CHANGELOG, LICENSE, package manifest, and icon if one is later added. Source,
tests, specs, workflow files, local editor configuration, and generated test
output are excluded through `.vscodeignore`.

The extension metadata is:

```json
{
  "name": "shuck",
  "displayName": "Shuck",
  "publisher": "ewhauser",
  "version": "0.1.0",
  "license": "MIT",
  "repository": "https://github.com/ewhauser/shuck-vscode"
}
```

### CI and Release

Pull requests and pushes to `main` run on Ubuntu with Node 22:

1. `npm ci`;
2. formatting check;
3. ESLint;
4. TypeScript checking;
5. pure unit tests;
6. VSIX packaging;
7. VS Code extension-host smoke tests under Xvfb.

Dependabot checks npm and GitHub Actions dependencies weekly.

On a published GitHub release, the release workflow rebuilds, verifies, and
packages `shuck-<version>.vsix`, uploads it to that release, and publishes it
to the Visual Studio Marketplace only when `VSCE_PAT` is configured. The
workflow verifies that the release tag and `package.json` version match before
publishing. A missing token skips Marketplace publication without weakening
the GitHub release artifact.

Release tags use `v<semver>`. Changes are recorded in `CHANGELOG.md`; version
and changelog changes are intentional release commits rather than runtime
auto-versioning.

### Testing

Pure unit tests cover semantic-version parsing/comparison, home-directory path
expansion, environment merging/validation, and configuration payload shape.

Extension-host smoke tests use a repository-authored fake stdio LSP server.
The fixture handles initialize, shutdown, and exit without implementing Shuck
analysis. It verifies the extension client rather than duplicating tests that
belong to `shuck-server`:

- activation reaches running state;
- the configured executable and arguments are used;
- initialization options include global and workspace settings;
- stop and restart commands settle in the expected state;
- deactivation shuts the child process down cleanly.

Manual testing uses a real supported Shuck release and covers:

- diagnostics update from unsaved edits;
- quick fix, disable-line action, and `source.fixAll.shuck`;
- document/range formatting and format on save;
- completion, hover, definition, references, highlights, symbols, call
  hierarchy, and same-file rename;
- `.shuck.toml` reload;
- multi-root folder options;
- missing/old executable errors;
- local and remote extension hosts.

## Alternatives Considered

### Keep the extension in the Shuck Cargo workspace

Rejected. A monorepo would simplify atomic changes but couple npm and VSIX
tooling, Marketplace metadata, Node dependency updates, and extension releases
to the much larger Rust CI and release process. LSP capability negotiation and
a documented minimum server version provide a clean independent boundary.

### Wrap `shuck check` and parse command output

Rejected. One-shot checks lose incremental in-memory analysis and the server's
structured fixes, formatting, completion, navigation, symbols, hover, call
hierarchy, cancellation, and rename support.

### Reimplement providers with `shuck-wasm`

Rejected for the native v1 extension. The WebAssembly package is useful for
web hosts and single-document lint/format use, but it is not the Shuck LSP and
would require the extension to recreate document state, workspace indexing,
configuration resolution, feature negotiation, and cross-feature behavior.
A future web extension can be designed separately if the WASM API grows an
appropriate editor-service boundary.

### Bundle platform-specific Shuck executables

Rejected for v1. Bundling would create one VSIX per target, increase package
size, omit unsupported targets, and require every extension release to
coordinate binary provenance and security updates. A user-installed executable
also serves the CLI and editor from the same version. Platform VSIX packages
may be reconsidered when Shuck's release matrix and Marketplace demand justify
the operational cost.

### Download Shuck on activation

Rejected. Runtime downloading adds network failure modes, proxy handling,
checksum/signature policy, update policy, executable permissions, storage
cleanup, and a larger trust boundary. The extension instead links to Shuck's
documented installers and supports an explicit path.

### Use a generic VS Code LSP client extension

Rejected as the primary experience. Generic clients remain compatible, but
they cannot provide Shuck-specific settings schema, executable validation,
status, install guidance, release metadata, or support diagnostics.

### Support browser extension hosts in the same package

Rejected. The native stdio process cannot run in a web worker. Declaring false
support is clearer than shipping a browser entrypoint with a substantially
smaller and behaviorally different feature set.

## Security Considerations

- The extension executes only the machine-scoped Shuck command selected by the
  user. Workspace settings cannot change the executable, arguments, or process
  environment.
- Child processes use `shell: false`; arguments are never concatenated or
  evaluated.
- The extension makes no runtime network requests, performs no automatic
  downloads, and collects no telemetry.
- Environment overrides are machine-scoped and never printed with values. Logs
  may list variable names for troubleshooting but must redact their contents.
- Server stdout is reserved for LSP framing. Human-readable server stderr and
  client logs go to the output channel.
- Project configuration is parsed by Shuck as data. The extension neither
  evaluates it nor derives executable paths from it.
- The extension may run in an untrusted workspace because its executable
  configuration is not workspace-controlled. This declaration must be
  revisited before adding any workspace-scoped command or argument setting.
- Protocol trace logs and native server logs may contain source text and local
  filesystem paths. Settings descriptions warn users to review logs before
  sharing them.
- Release workflows use least-privilege GitHub permissions. Marketplace tokens
  remain repository secrets and are never available to pull-request jobs.
- The VSIX is built from a locked npm dependency graph. CI inspects its file
  list before upload so repository secrets, fixtures, and local files cannot be
  packaged accidentally.

## Verification

Run the complete local verification suite:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run package
npm run test:integration
```

Inspect package contents:

```sh
npx vsce ls
unzip -l shuck-0.1.0.vsix
```

Run real-server smoke testing with Shuck `0.0.43` or newer:

```sh
shuck --version
code --extensionDevelopmentPath="$PWD"
```

The implementation is complete when:

- all automated commands above pass from a clean checkout;
- the VSIX installs without npm dependencies or development-only files;
- a real local and remote VS Code window reaches running state;
- all capabilities advertised by `shuck server` are usable through VS Code's
  standard UI;
- global and per-folder editor options reach the server and update dynamically;
- process-setting changes restart exactly one server;
- missing and outdated executables produce actionable errors without restart
  loops;
- no runtime network request or telemetry event occurs; and
- this document's status is `Implemented` and matches the shipped code.
