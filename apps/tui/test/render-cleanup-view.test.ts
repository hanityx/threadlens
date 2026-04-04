import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { CleanupView } from "../src/views/CleanupView.js";
import { getMessages } from "../src/i18n/index.js";

test("CleanupView renders localized empty state copy", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const consoleErrors: string[] = [];
  console.error = (...args: unknown[]) => {
    consoleErrors.push(
      args
        .map((value) =>
          typeof value === "string" ? value : JSON.stringify(value),
        )
        .join(" | "),
    );
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/threads")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            rows: [],
            total: 0,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let output = "";
    stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    const ui = React.createElement(CleanupView, {
      active: true,
      locale: "es",
      messages: getMessages("es"),
      inputEnabled: false,
      initialThreadId: null,
      initialFilter: "",
      onInitialThreadIdHandled: () => {},
      onTextEntryChange: () => {},
      onFilterChange: () => {},
    });

    const renderer = render(ui, {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stdout as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
      patchConsole: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    renderer.unmount();

    assert.match(output, /No hay hilos\./);
    assert.match(output, /Selecciona un hilo\./);
    assert.match(output, /filtro/);
    assert.equal(
      consoleErrors.some((entry) => entry.includes("same key")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
