import * as vscode from "vscode";
import {
  LanguageClient,
  RevealOutputChannelOn,
  State as LanguageClientState,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

import {
  buildInitializationOptions,
  clientConfigurationChanged,
  processConfigurationChanged,
} from "./configuration";
import {
  probeServer,
  readServerProcessConfiguration,
  ServerConfigurationError,
  ServerProbeError,
  toLanguageClientExecutable,
  type ServerProcessConfiguration,
} from "./server";

export type ControllerState = "stopped" | "starting" | "running" | "failed";

export interface ControllerSnapshot {
  readonly state: ControllerState;
  readonly command?: string;
  readonly arguments?: readonly string[];
  readonly version?: string;
  readonly workspaceCount: number;
  readonly error?: string;
}

const supportedLanguages = new Set(["shellscript", "bash", "sh", "zsh", "ksh"]);

const documentSelector = [...supportedLanguages].flatMap((language) =>
  ["file", "untitled", "vscode-remote"].map((scheme) => ({ language, scheme })),
);

export class ShuckController implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("Shuck", { log: true });
  private readonly traceOutput = vscode.window.createOutputChannel("Shuck Language Server Trace", {
    log: true,
  });
  private readonly statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );
  private readonly disposables: vscode.Disposable[] = [];
  private operation = Promise.resolve();
  private client: LanguageClient | undefined;
  private clientStateSubscription: vscode.Disposable | undefined;
  private state: ControllerState = "stopped";
  private lastConfiguration: ServerProcessConfiguration | undefined;
  private detectedVersion: string | undefined;
  private lastError: string | undefined;
  private intentionalStop = false;
  private disposed = false;

  public constructor() {
    this.statusBar.name = "Shuck Language Server";
    this.disposables.push(
      vscode.commands.registerCommand("shuck.startServer", () => this.start()),
      vscode.commands.registerCommand("shuck.stopServer", () => this.stop()),
      vscode.commands.registerCommand("shuck.restartServer", () => this.restart()),
      vscode.commands.registerCommand("shuck.showOutput", () => this.output.show(true)),
      vscode.commands.registerCommand("shuck.showServerStatus", () => this.showStatus()),
      vscode.commands.registerCommand("shuck.openSettings", () =>
        vscode.commands.executeCommand("workbench.action.openSettings", "@ext:ewhauser.shuck"),
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (processConfigurationChanged(event)) {
          void this.restart();
        } else if (clientConfigurationChanged(event)) {
          void this.sendConfiguration();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.sendConfiguration();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateStatusBar()),
      this.statusBar,
      this.output,
      this.traceOutput,
    );
    this.updateStatusBar();
  }

  public start(): Promise<void> {
    return this.enqueue(() => this.startNow());
  }

  public stop(): Promise<void> {
    return this.enqueue(() => this.stopNow());
  }

  public restart(): Promise<void> {
    return this.enqueue(async () => {
      await this.stopNow();
      await this.startNow();
    });
  }

  public snapshot(): ControllerSnapshot {
    return {
      state: this.state,
      ...(this.lastConfiguration === undefined
        ? {}
        : {
            command: this.lastConfiguration.command,
            arguments: this.lastConfiguration.arguments,
          }),
      ...(this.detectedVersion === undefined ? {} : { version: this.detectedVersion }),
      workspaceCount: vscode.workspace.workspaceFolders?.length ?? 0,
      ...(this.lastError === undefined ? {} : { error: this.lastError }),
    };
  }

  public async shutdown(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.stop();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  public dispose(): void {
    void this.shutdown();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.then(operation, operation);
    this.operation = next.catch((error: unknown) => {
      this.output.appendLine(
        `[controller] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    });
    return next;
  }

  private async startNow(): Promise<void> {
    if (this.state === "starting" || this.state === "running") {
      return;
    }

    this.setState("starting");
    this.lastError = undefined;
    this.detectedVersion = undefined;
    let client: LanguageClient | undefined;
    try {
      const processConfiguration = readServerProcessConfiguration();
      this.lastConfiguration = processConfiguration;
      this.output.appendLine(
        `[server] probing ${JSON.stringify(processConfiguration.command)} --version`,
      );
      if (processConfiguration.environmentKeys.length > 0) {
        this.output.appendLine(
          `[server] environment overrides (values redacted): ${processConfiguration.environmentKeys.join(", ")}`,
        );
      }

      const probe = await probeServer(processConfiguration);
      this.detectedVersion = probe.version;
      if (probe.method === "help") {
        this.output.appendLine(
          "[server] executable does not expose a version; validated the configured server command",
        );
      } else if (probe.version === undefined) {
        this.output.appendLine(
          `[server] version output was not recognized; continuing with development executable: ${probe.output}`,
        );
      } else {
        this.output.appendLine(`[server] detected Shuck ${probe.version}`);
      }

      const executable = toLanguageClientExecutable(processConfiguration);
      const serverOptions: ServerOptions = {
        run: executable,
        debug: executable,
      };
      const clientOptions: LanguageClientOptions = {
        documentSelector,
        initializationOptions: buildInitializationOptions(),
        outputChannel: this.output,
        traceOutputChannel: this.traceOutput,
        revealOutputChannelOn: RevealOutputChannelOn.Never,
      };

      client = new LanguageClient("shuck", "Shuck Language Server", serverOptions, clientOptions);
      this.intentionalStop = false;
      this.client = client;
      this.clientStateSubscription = client.onDidChangeState(({ newState }) => {
        this.handleClientState(newState);
      });
      await client.start();
      this.setState("running");
      this.output.appendLine("[server] language server initialized");
    } catch (error: unknown) {
      this.clientStateSubscription?.dispose();
      this.clientStateSubscription = undefined;
      this.client = undefined;
      if (client !== undefined) {
        try {
          await client.stop();
        } catch {
          // The failed start may not have reached a state that can be stopped.
        }
      }
      this.reportStartFailure(error);
    }
  }

  private async stopNow(): Promise<void> {
    const client = this.client;
    if (client === undefined) {
      this.setState("stopped");
      return;
    }

    this.intentionalStop = true;
    this.client = undefined;
    this.clientStateSubscription?.dispose();
    this.clientStateSubscription = undefined;
    try {
      await client.stop();
      this.output.appendLine("[server] language server stopped");
    } catch (error: unknown) {
      this.output.appendLine(
        `[server] stop failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.intentionalStop = false;
      this.setState("stopped");
    }
  }

  private sendConfiguration(): Promise<void> {
    return this.enqueue(async () => {
      if (this.client === undefined || this.state !== "running") {
        return;
      }
      await this.client.sendNotification("workspace/didChangeConfiguration", {
        settings: buildInitializationOptions(),
      });
      this.output.appendLine("[config] sent updated editor settings");
    });
  }

  private handleClientState(state: LanguageClientState): void {
    if (state === LanguageClientState.Starting) {
      this.setState("starting");
    } else if (state === LanguageClientState.Running) {
      this.setState("running");
    } else if (!this.intentionalStop && (this.state === "running" || this.state === "starting")) {
      this.lastError = "The language server stopped unexpectedly.";
      this.setState("failed");
    }
  }

  private setState(state: ControllerState): void {
    this.state = state;
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    const activeLanguage = vscode.window.activeTextEditor?.document.languageId;
    const activeDocumentIsSupported =
      activeLanguage !== undefined && supportedLanguages.has(activeLanguage);

    switch (this.state) {
      case "starting":
        this.statusBar.text = "$(sync~spin) Shuck";
        this.statusBar.tooltip = "Shuck language server is starting. Click to show output.";
        this.statusBar.command = "shuck.showOutput";
        break;
      case "running":
        this.statusBar.text = "$(check) Shuck";
        this.statusBar.tooltip = `Shuck language server is running${this.detectedVersion === undefined ? "" : ` (${this.detectedVersion})`}. Click for status.`;
        this.statusBar.command = "shuck.showServerStatus";
        break;
      case "stopped":
        this.statusBar.text = "$(circle-slash) Shuck";
        this.statusBar.tooltip = "Shuck language server is stopped. Click to start.";
        this.statusBar.command = "shuck.startServer";
        break;
      case "failed":
        this.statusBar.text = "$(error) Shuck";
        this.statusBar.tooltip = `${this.lastError ?? "Shuck language server failed."} Click to show output.`;
        this.statusBar.command = "shuck.showOutput";
        break;
    }

    if (activeDocumentIsSupported || this.state !== "running") {
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  private reportStartFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.lastError = message;
    this.output.appendLine(`[server] startup failed: ${message}`);
    this.setState("failed");
    void this.presentStartFailure(error, message);
  }

  private async presentStartFailure(error: unknown, message: string): Promise<void> {
    if (error instanceof ServerProbeError && error.kind === "missing") {
      const choice = await vscode.window.showErrorMessage(
        message,
        "Installation Guide",
        "Open Settings",
      );
      if (choice === "Installation Guide") {
        await vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/ewhauser/shuck#installation"),
        );
      } else if (choice === "Open Settings") {
        await vscode.commands.executeCommand("shuck.openSettings");
      }
      return;
    }

    if (error instanceof ServerProbeError && error.kind === "old") {
      const choice = await vscode.window.showErrorMessage(message, "Open Releases", "Show Output");
      if (choice === "Open Releases") {
        await vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/ewhauser/shuck/releases"),
        );
      } else if (choice === "Show Output") {
        this.output.show(true);
      }
      return;
    }

    const choices =
      error instanceof ServerConfigurationError
        ? ["Open Settings"]
        : ["Show Output", "Open Settings"];
    const choice = await vscode.window.showErrorMessage(message, ...choices);
    if (choice === "Show Output") {
      this.output.show(true);
    } else if (choice === "Open Settings") {
      await vscode.commands.executeCommand("shuck.openSettings");
    }
  }

  private async showStatus(): Promise<void> {
    const snapshot = this.snapshot();
    const command =
      snapshot.command === undefined
        ? "not resolved"
        : [snapshot.command, ...(snapshot.arguments ?? [])]
            .map((part) => JSON.stringify(part))
            .join(" ");
    const details = [
      `State: ${snapshot.state}`,
      `Command: ${command}`,
      `Version: ${snapshot.version ?? "unrecognized"}`,
      `Workspace folders: ${snapshot.workspaceCount}`,
      ...(snapshot.error === undefined ? [] : [`Last error: ${snapshot.error}`]),
    ].join("\n");
    const choice = await vscode.window.showInformationMessage(
      details,
      { modal: true },
      "Show Output",
    );
    if (choice === "Show Output") {
      this.output.show(true);
    }
  }
}
