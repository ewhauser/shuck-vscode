# Security Policy

## Reporting a vulnerability

Please report vulnerabilities through GitHub's private security advisory flow
for `ewhauser/shuck-vscode`. Do not open a public issue for an unpatched
vulnerability.

Include the extension version, VS Code version, operating system or remote
environment, reproduction steps, and expected impact. Avoid attaching protocol
or server logs unless they have been reviewed for source text, credentials, and
local filesystem paths.

## Runtime security model

- The extension executes only the machine-scoped `shuck.server.path` command.
- Child processes use direct argument arrays and never invoke a shell.
- The extension downloads no executable code and collects no telemetry.
- Project configuration is passed to Shuck as data and is not evaluated by the
  extension.

Only the latest released extension version receives security fixes.
