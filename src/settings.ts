export interface ClientOptions {
  readonly fixAll: boolean;
  readonly unsafeFixes: boolean;
  readonly showSyntaxErrors: boolean;
  readonly server: {
    readonly workspaceSymbols: {
      readonly enabled: boolean;
      readonly maxFiles: number;
    };
    readonly completion: {
      readonly includeRuntimeNames: boolean;
      readonly includeKeywords: boolean;
    };
    readonly rename: {
      readonly allowCrossFile: false;
    };
  };
}

export interface ConfigurationReader {
  get<T>(section: string, defaultValue: T): T;
}

export function readClientOptions(configuration: ConfigurationReader): ClientOptions {
  return {
    fixAll: configuration.get("fixAll", true),
    unsafeFixes: configuration.get("unsafeFixes", false),
    showSyntaxErrors: configuration.get("showSyntaxErrors", false),
    server: {
      workspaceSymbols: {
        enabled: configuration.get("workspaceSymbols.enabled", true),
        maxFiles: configuration.get("workspaceSymbols.maxFiles", 5000),
      },
      completion: {
        includeRuntimeNames: configuration.get("completion.includeRuntimeNames", true),
        includeKeywords: configuration.get("completion.includeKeywords", true),
      },
      rename: {
        allowCrossFile: false,
      },
    },
  };
}
