import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import {
  CleanupView,
  shouldClearCleanupSelectionStatus,
  shouldKeepPendingCleanup,
  shouldRenderCleanupSelectionDetails,
  shouldRenderCleanupStatus,
} from "../src/views/CleanupView.js";
import { getMessages } from "../src/i18n/index.js";

function normalizeConsoleErrorEntry(args: unknown[]): string {
  return args
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join(" | ");
}

function isAllowedConsoleError(entry: string): boolean {
  return entry.includes("Encountered two children with the same key");
}

function createInkInput() {
  const stdin = new PassThrough();
  return Object.assign(stdin, {
    isTTY: true,
    ref: () => stdin,
    setRawMode: () => stdin,
    unref: () => stdin,
  });
}

test("CleanupView renders localized empty state copy", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const consoleErrors: string[] = [];
  console.error = (...args: unknown[]) => {
    consoleErrors.push(normalizeConsoleErrorEntry(args));
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
    const stdin = createInkInput();
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
    assert.deepEqual(
      consoleErrors.filter((entry) => !isAllowedConsoleError(entry)),
      [],
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test("CleanupView shows a selection guardrail before execute when nothing is selected", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const consoleErrors: string[] = [];
  console.error = (...args: unknown[]) => {
    consoleErrors.push(normalizeConsoleErrorEntry(args));
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/threads")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            rows: [
              {
                thread_id: "thread-1",
                risk_score: 54,
                risk_level: "medium",
                tags: [],
                source: "sessions",
                pinned: false,
              },
            ],
            total: 1,
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
    const stdin = createInkInput();
    const stdout = new PassThrough();
    let output = "";
    stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    const ui = React.createElement(CleanupView, {
      active: true,
      locale: "en",
      messages: getMessages("en"),
      inputEnabled: true,
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
    stdin.write("D");
    await new Promise((resolve) => setTimeout(resolve, 80));
    renderer.unmount();

    assert.match(output, /Select a thread\./);
    assert.deepEqual(
      consoleErrors.filter((entry) => !isAllowedConsoleError(entry)),
      [],
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test("CleanupView clears the selection guardrail when selection becomes non-empty", () => {
  assert.equal(
    shouldClearCleanupSelectionStatus("Select a thread.", 1, "Select a thread."),
    true,
  );
  assert.equal(
    shouldClearCleanupSelectionStatus("Select a thread.", 0, "Select a thread."),
    false,
  );
  assert.equal(
    shouldClearCleanupSelectionStatus("Other status", 2, "Select a thread."),
    false,
  );
});

test("CleanupView suppresses duplicate status text when pending token guidance is visible", () => {
  const prompt = getMessages("en").cleanup.executePrompt("tok-123");
  assert.equal(
    shouldRenderCleanupStatus({ tone: "pending", text: prompt }, prompt),
    false,
  );
  assert.equal(
    shouldRenderCleanupStatus({ tone: "success", text: "done" }, prompt),
    true,
  );
});

test("CleanupView clears a pending token when the selected ids change", () => {
  assert.equal(shouldKeepPendingCleanup(["thread-1"], ["thread-1"]), true);
  assert.equal(shouldKeepPendingCleanup(["thread-1"], []), false);
  assert.equal(shouldKeepPendingCleanup(["thread-1"], ["thread-2"]), false);
});

test("CleanupView shows analysis and cleanup details only for targeted threads", () => {
  assert.equal(shouldRenderCleanupSelectionDetails(["thread-1", "thread-2"], "thread-1"), true);
  assert.equal(shouldRenderCleanupSelectionDetails(["thread-1", "thread-2"], "thread-3"), false);
  assert.equal(shouldRenderCleanupSelectionDetails(["thread-1"], null), false);
});

test("CleanupView collapses duplicate thread rows before rendering", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const consoleErrors: string[] = [];
  console.error = (...args: unknown[]) => {
    consoleErrors.push(normalizeConsoleErrorEntry(args));
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/threads")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            rows: [
              {
                thread_id: "thread-dup",
                title: "Live thread",
                risk_score: 40,
                risk_level: "medium",
                risk_tags: ["ctx-high"],
                source: "sessions",
                is_pinned: false,
                cwd: "/repo/live",
              },
              {
                thread_id: "thread-dup",
                title: "Backup thread",
                risk_score: 40,
                risk_level: "medium",
                risk_tags: ["ctx-high"],
                source: "cleanup_backups",
                is_pinned: false,
                cwd: "/repo/backup",
              },
            ],
            total: 2,
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
    const stdin = createInkInput();
    const stdout = new PassThrough();
    let output = "";
    stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    const ui = React.createElement(CleanupView, {
      active: true,
      locale: "en",
      messages: getMessages("en"),
      inputEnabled: true,
      initialThreadId: null,
      initialFilter: "thread-dup",
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
    await new Promise((resolve) => setTimeout(resolve, 120));
    renderer.unmount();

    assert.match(output, /1–1\/1/);
    assert.match(output, /Live thread/);
    assert.doesNotMatch(output, /Backup thread/);
    assert.deepEqual(consoleErrors, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
