import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { SessionsView, buildSessionActionHints, shouldRenderSessionActionStatus } from "../src/views/SessionsView.js";
import { getMessages } from "../src/i18n/index.js";

test("SessionsView renders localized empty state copy", async () => {
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
    if (url.includes("/api/provider-sessions")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            summary: {
              rows: 0,
              parse_ok: 0,
              parse_fail: 0,
            },
            providers: [],
            rows: [],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    if (url.includes("/api/session-transcript")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            messages: [],
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
    const ui = React.createElement(SessionsView, {
      active: true,
      locale: "es",
      messages: getMessages("es"),
      inputEnabled: false,
      provider: "codex",
      setProvider: () => {},
      initialFilePath: null,
      initialFilter: "",
      onInitialFilePathHandled: () => {},
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

    assert.match(output, /No hay sesiones\./);
    assert.match(output, /Selecciona una sesión\./);
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

test("SessionsView suppresses duplicate status text when pending token guidance is visible", () => {
  const prompt = "토큰: tok-123  ·  A로 실행";
  assert.equal(
    shouldRenderSessionActionStatus({ tone: "pending", text: prompt }, prompt),
    false,
  );
  assert.equal(
    shouldRenderSessionActionStatus({ tone: "success", text: "완료" }, prompt),
    true,
  );
});

test("SessionsView builds stable action hints for localized detail panes", () => {
  assert.deepEqual(buildSessionActionHints(getMessages("es")), [
    "b backup",
    "a archive dry-run",
    "A ejecutar archive",
    "d delete dry-run",
    "D ejecutar delete",
  ]);
  assert.deepEqual(buildSessionActionHints(getMessages("zh-CN")), [
    "b backup",
    "a archive dry-run",
    "A 执行 archive",
    "d delete dry-run",
    "D 执行 delete",
  ]);
});
