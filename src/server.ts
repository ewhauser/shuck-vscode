import { execFile } from "node:child_process";
import * as vscode from "vscode";
import type { Executable } from "vscode-languageclient/node";

import { expandHome, mergeEnvironment, ServerConfigurationError } from "./process";
import { isVersionAtLeast, minimumServerVersion, parseShuckVersion } from "./version";

export { ServerConfigurationError } from "./process";

const probeTimeoutMilliseconds = 5_000;
const probeMaxBufferBytes = 64 * 1024;

export interface ServerProcessConfiguration {
  readonly command: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly environmentKeys: readonly string[];
}

export interface ServerProbe {
  readonly version?: string;
  readonly output: string;
  readonly method: "version" | "help";
}

export class ServerProbeError extends Error {
  public constructor(
    message: string,
    public readonly kind: "missing" | "old" | "failed",
  ) {
    super(message);
  }
}

class ProbeCommandError extends Error {
  public constructor(
    message: string,
    public readonly code: string | undefined,
  ) {
    super(message);
  }
}

export function readServerProcessConfiguration(): ServerProcessConfiguration {
  const configuration = vscode.workspace.getConfiguration("shuck", null);
  const command = expandHome(configuration.get("server.path", "shuck").trim());
  if (command === "") {
    throw new ServerConfigurationError("shuck.server.path must not be empty");
  }

  const rawArguments = configuration.get<unknown>("server.arguments", ["server"]);
  if (
    !Array.isArray(rawArguments) ||
    !rawArguments.every((argument) => typeof argument === "string")
  ) {
    throw new ServerConfigurationError("shuck.server.arguments must contain only strings");
  }

  const rawEnvironment = configuration.get<unknown>("server.environment", {});
  if (
    typeof rawEnvironment !== "object" ||
    rawEnvironment === null ||
    Array.isArray(rawEnvironment)
  ) {
    throw new ServerConfigurationError("shuck.server.environment must be an object");
  }
  const { environment, keys } = mergeEnvironment(
    process.env,
    rawEnvironment as Readonly<Record<string, unknown>>,
  );

  return {
    command,
    arguments: rawArguments,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
    environment,
    environmentKeys: keys,
  };
}

export function toLanguageClientExecutable(configuration: ServerProcessConfiguration): Executable {
  return {
    command: configuration.command,
    args: [...configuration.arguments],
    options: {
      cwd: configuration.cwd,
      env: configuration.environment,
      shell: false,
    },
  };
}

export async function probeServer(configuration: ServerProcessConfiguration): Promise<ServerProbe> {
  let result: { stdout: string; stderr: string };
  try {
    result = await executeProbe(configuration, ["--version"]);
  } catch (error: unknown) {
    if (error instanceof ProbeCommandError && error.code === "ENOENT") {
      throw new ServerProbeError(
        `Could not find the Shuck executable at ${JSON.stringify(configuration.command)}.`,
        "missing",
      );
    }

    try {
      result = await executeProbe(configuration, [...configuration.arguments, "--help"]);
    } catch (fallbackError: unknown) {
      throw new ServerProbeError(
        `Shuck server check failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        "failed",
      );
    }

    return {
      output: `${result.stdout}\n${result.stderr}`.trim(),
      method: "help",
    };
  }

  const output = `${result.stdout}\n${result.stderr}`.trim();
  const version = parseShuckVersion(output);
  if (version !== undefined && isVersionAtLeast(version, minimumServerVersion) === false) {
    throw new ServerProbeError(
      `Shuck ${version} is too old. This extension requires Shuck ${minimumServerVersion} or newer.`,
      "old",
    );
  }
  return { version, output, method: "version" };
}

async function executeProbe(
  configuration: ServerProcessConfiguration,
  arguments_: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      configuration.command,
      [...arguments_],
      {
        cwd: configuration.cwd,
        env: configuration.environment,
        timeout: probeTimeoutMilliseconds,
        maxBuffer: probeMaxBufferBytes,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new ProbeCommandError(
              error.message,
              typeof error.code === "string" ? error.code : undefined,
            ),
          );
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}
