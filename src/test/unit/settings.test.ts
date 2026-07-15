import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readClientOptions, type ConfigurationReader } from "../../settings";

function reader(values: Readonly<Record<string, unknown>>): ConfigurationReader {
  return {
    get<T>(section: string, defaultValue: T): T {
      return (values[section] as T | undefined) ?? defaultValue;
    },
  };
}

void describe("client settings", () => {
  void it("maps VS Code settings to Shuck client options", () => {
    const options = readClientOptions(
      reader({
        fixAll: false,
        unsafeFixes: true,
        "workspaceSymbols.maxFiles": 25,
        "completion.includeKeywords": false,
      }),
    );

    assert.equal(options.fixAll, false);
    assert.equal(options.unsafeFixes, true);
    assert.equal(options.server.workspaceSymbols.maxFiles, 25);
    assert.equal(options.server.completion.includeKeywords, false);
    assert.equal(options.server.rename.allowCrossFile, false);
  });

  void it("uses server-compatible defaults", () => {
    const options = readClientOptions(reader({}));
    assert.equal(options.fixAll, true);
    assert.equal(options.unsafeFixes, false);
    assert.equal(options.showSyntaxErrors, false);
    assert.equal(options.server.workspaceSymbols.enabled, true);
    assert.equal(options.server.workspaceSymbols.maxFiles, 5000);
  });
});
