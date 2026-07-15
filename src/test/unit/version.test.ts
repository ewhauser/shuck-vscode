import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareSemanticVersions,
  isVersionAtLeast,
  parseSemanticVersion,
  parseShuckVersion,
} from "../../version";

void describe("version", () => {
  void it("parses Shuck version output", () => {
    assert.equal(parseShuckVersion("shuck 0.0.43\n"), "0.0.43");
    assert.equal(parseShuckVersion("shuck-cli v1.2.3-beta.1"), "1.2.3-beta.1");
    assert.equal(parseShuckVersion("v22.1.0"), undefined);
  });

  void it("orders stable and prerelease versions", () => {
    const stable = parseSemanticVersion("1.2.3");
    const prerelease = parseSemanticVersion("1.2.3-rc.1");
    assert.ok(stable);
    assert.ok(prerelease);
    assert.equal(compareSemanticVersions(stable, prerelease), 1);
    assert.equal(isVersionAtLeast("0.0.43", "0.0.43"), true);
    assert.equal(isVersionAtLeast("0.0.42", "0.0.43"), false);
    assert.equal(isVersionAtLeast("invalid", "0.0.43"), undefined);
  });
});
