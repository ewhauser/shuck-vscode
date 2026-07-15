import { ShuckController, type ControllerSnapshot } from "./controller";

export interface ShuckExtensionApi {
  readonly status: () => ControllerSnapshot;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly restart: () => Promise<void>;
}

let controller: ShuckController | undefined;

export async function activate(): Promise<ShuckExtensionApi> {
  controller = new ShuckController();
  await controller.start();
  return {
    status: () => controller?.snapshot() ?? { state: "stopped", workspaceCount: 0 },
    start: () => controller?.start() ?? Promise.resolve(),
    stop: () => controller?.stop() ?? Promise.resolve(),
    restart: () => controller?.restart() ?? Promise.resolve(),
  };
}

export async function deactivate(): Promise<void> {
  const activeController = controller;
  controller = undefined;
  await activeController?.shutdown();
}
