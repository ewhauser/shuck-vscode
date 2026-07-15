import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { expandHome, mergeEnvironment, ServerConfigurationError } from "../../process";

void describe("process configuration", () => {
  void it("expands only a leading home marker", () => {
    assert.equal(expandHome("~/bin/shuck", "/home/tester"), "/home/tester/bin/shuck");
    assert.equal(expandHome("~", "/home/tester"), "/home/tester");
    assert.equal(expandHome("bin/~/shuck", "/home/tester"), "bin/~/shuck");
  });

  void it("merges string environment values and reports only their keys", () => {
    const result = mergeEnvironment({ PATH: "/bin" }, { TOKEN: "secret", EMPTY: "" });
    assert.deepEqual(result.environment, { PATH: "/bin", TOKEN: "secret", EMPTY: "" });
    assert.deepEqual(result.keys, ["EMPTY", "TOKEN"]);
    assert.throws(
      () => mergeEnvironment({}, { INVALID: 1 }),
      (error: unknown) => error instanceof ServerConfigurationError,
    );
  });
});
