const test = require("node:test");
const assert = require("node:assert/strict");

const pkg = require("./package.json");

test("root package exposes a fresh-clone-safe TUI start command", () => {
  assert.equal(
    pkg.scripts["build:tui"],
    "pnpm --filter @threadlens/tui build",
  );
  assert.equal(
    pkg.scripts["start:tui"],
    "pnpm --filter @threadlens/shared-contracts build && pnpm --filter @threadlens/tui exec tsx src/cli.tsx",
  );
});
