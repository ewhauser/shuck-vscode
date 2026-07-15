import * as os from "node:os";
import * as path from "node:path";

export class ServerConfigurationError extends Error {}

export function expandHome(input: string, homeDirectory = os.homedir()): string {
  if (input === "~") {
    return homeDirectory;
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(homeDirectory, input.slice(2));
  }
  return input;
}

export function mergeEnvironment(
  base: NodeJS.ProcessEnv,
  overrides: Readonly<Record<string, unknown>>,
): { environment: NodeJS.ProcessEnv; keys: string[] } {
  const environment: NodeJS.ProcessEnv = { ...base };
  const keys: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== "string") {
      throw new ServerConfigurationError(`shuck.server.environment.${key} must be a string`);
    }
    environment[key] = value;
    keys.push(key);
  }
  return { environment, keys: keys.sort() };
}
