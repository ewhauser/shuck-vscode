import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import type { ShuckExtensionApi } from "../../extension";

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function runExtensionTests(): Promise<void> {
  const extension = vscode.extensions.getExtension<ShuckExtensionApi>("ewhauser.shuck");
  assert.ok(extension, "development extension should be available");

  const initializationLog = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "shuck-vscode-")),
    "init.json",
  );
  const fakeServer = path.join(
    extension.extensionPath,
    "src",
    "test",
    "fixtures",
    "fake-server.cjs",
  );
  const realServer = process.env.SHUCK_TEST_SERVER_PATH;
  const useRealServer = realServer !== undefined && realServer !== "";
  const configuration = vscode.workspace.getConfiguration("shuck");
  await configuration.update(
    "server.path",
    useRealServer ? realServer : process.execPath,
    vscode.ConfigurationTarget.Global,
  );
  await configuration.update(
    "server.arguments",
    useRealServer ? ["server"] : [fakeServer],
    vscode.ConfigurationTarget.Global,
  );
  await configuration.update(
    "server.environment",
    useRealServer ? {} : { SHUCK_FAKE_SERVER_LOG: initializationLog },
    vscode.ConfigurationTarget.Global,
  );
  await configuration.update("fixAll", false, vscode.ConfigurationTarget.Workspace);

  const api = await extension.activate();
  try {
    await waitFor(() => api.status().state === "running", "server did not reach running state");

    if (useRealServer) {
      assert.equal(api.status().command, realServer);
      assert.ok(api.status().version, "real Shuck should report its version");
    } else {
      const payload = JSON.parse(await fs.readFile(initializationLog, "utf8")) as {
        shuck: { fixAll: boolean; server: { rename: { allowCrossFile: boolean } } };
        workspace?: Record<string, { fixAll: boolean }>;
      };
      assert.equal(payload.shuck.fixAll, false);
      assert.equal(payload.shuck.server.rename.allowCrossFile, false);
      assert.equal(api.status().command, process.execPath);
    }

    await vscode.commands.executeCommand("shuck.stopServer");
    assert.equal(api.status().state, "stopped");

    await vscode.commands.executeCommand("shuck.startServer");
    assert.equal(api.status().state, "running");

    await vscode.commands.executeCommand("shuck.restartServer");
    assert.equal(api.status().state, "running");
  } finally {
    await api.stop();
  }
}
