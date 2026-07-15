# Contributing

Thanks for improving the Shuck extension.

## Development setup

Install Node 22 or newer, clone the repository, and run:

```sh
npm ci
npm run build
```

Use the `Run Shuck Extension` launch configuration or press `F5` to open an
Extension Development Host.

## Validation

Before opening a pull request, run:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run package
npm run test:integration
```

The integration suite downloads a VS Code test runtime on first use.
Set `SHUCK_TEST_SERVER_PATH` to a current Shuck executable to run the same
extension-host lifecycle smoke test against the real language server instead
of the repository's transport fixture:

```sh
SHUCK_TEST_SERVER_PATH=/path/to/shuck npm run test:integration
```

## Design boundary

The extension owns process lifecycle, configuration mapping, and VS Code user
experience. Shell parsing, diagnostics, fixes, formatting, completion,
navigation, symbols, and rename belong in the
[Shuck repository](https://github.com/ewhauser/shuck). Do not reproduce those
features in TypeScript.

Update `specs/001-vscode-extension.md` when a change modifies the architectural
or security contract.
