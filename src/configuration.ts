import * as vscode from "vscode";

import { readClientOptions, type ClientOptions } from "./settings";

export type NativeLogLevel = "error" | "warn" | "info" | "debug" | "trace";

export interface InitializationOptions {
  readonly shuck: ClientOptions & {
    readonly tracing: {
      readonly logLevel: NativeLogLevel;
      readonly logFile?: string;
    };
  };
  readonly workspace?: Readonly<Record<string, ClientOptions>>;
}

export function buildInitializationOptions(): InitializationOptions {
  const configuration = vscode.workspace.getConfiguration("shuck", null);
  const global = readClientOptions(configuration);
  const logFile = configuration.get("server.logFile", "").trim();
  const tracing = {
    logLevel: configuration.get<NativeLogLevel>("server.logLevel", "warn"),
    ...(logFile === "" ? {} : { logFile }),
  };

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const workspace = Object.fromEntries(
    workspaceFolders.map((folder) => [
      folder.uri.toString(),
      readClientOptions(vscode.workspace.getConfiguration("shuck", folder.uri)),
    ]),
  );

  return {
    shuck: {
      ...global,
      tracing,
    },
    ...(workspaceFolders.length === 0 ? {} : { workspace }),
  };
}

export function processConfigurationChanged(event: vscode.ConfigurationChangeEvent): boolean {
  return [
    "shuck.server.path",
    "shuck.server.arguments",
    "shuck.server.environment",
    "shuck.server.logFile",
    "shuck.server.logLevel",
  ].some((section) => event.affectsConfiguration(section));
}

export function clientConfigurationChanged(event: vscode.ConfigurationChangeEvent): boolean {
  return [
    "shuck.fixAll",
    "shuck.unsafeFixes",
    "shuck.showSyntaxErrors",
    "shuck.workspaceSymbols",
    "shuck.completion",
  ].some((section) => event.affectsConfiguration(section));
}
