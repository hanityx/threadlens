import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { SearchView } from "../src/views/SearchView.js";
import { getMessages } from "../src/i18n/index.js";

function createInkInput() {
  const stdin = new PassThrough();
  return Object.assign(stdin, {
    isTTY: true,
    ref: () => stdin,
    setRawMode: () => stdin,
    unref: () => stdin,
  });
}

test("SearchView keeps update shortcuts out of query text entry", async () => {
  const stdin = createInkInput();
  const stdout = new PassThrough();
  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk.toString("utf8");
  });

  const ui = React.createElement(SearchView, {
    active: true,
    locale: "en",
    messages: getMessages("en"),
    reserveUpdateShortcuts: true,
    onOpenSession: () => {},
    onOpenCleanup: () => {},
    onTextEntryChange: () => {},
    onQueryChange: () => {},
    onProviderChange: () => {},
    onFocusModeChange: () => {},
  });

  const renderer = render(ui, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  stdin.write("u");
  await new Promise((resolve) => setTimeout(resolve, 50));
  renderer.unmount();

  assert.doesNotMatch(output, /›\s+u▌/);
});
