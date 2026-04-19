import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildDesktopTrustReport,
  renderDesktopTrustNotes,
  writeDesktopTrustNotes,
} from "./generate-desktop-trust-notes.mjs";

test("buildDesktopTrustReport marks unsigned release when no signing secrets are present", () => {
  const report = buildDesktopTrustReport({});
  assert.equal(report.macos.status, "unsigned");
  assert.equal(report.windows.status, "unsigned");
  assert.equal(report.linux.status, "checksum-only");
});

test("buildDesktopTrustReport marks macOS signed and notarized when full credentials exist", () => {
  const report = buildDesktopTrustReport({
    CSC_LINK: "https://example.com/cert.p12",
    CSC_KEY_PASSWORD: "secret",
    APPLE_API_KEY: "base64-p8",
    APPLE_API_KEY_ID: "ABC123",
    APPLE_API_ISSUER: "issuer-id",
  });

  assert.equal(report.macos.status, "signed-and-notarized");
  assert.equal(report.macos.signed, true);
  assert.equal(report.macos.notarized, true);
});

test("buildDesktopTrustReport marks Windows signed when certificate secrets exist", () => {
  const report = buildDesktopTrustReport({
    WIN_CSC_LINK: "https://example.com/windows.pfx",
    WIN_CSC_KEY_PASSWORD: "secret",
  });

  assert.equal(report.windows.status, "signed");
});

test("renderDesktopTrustNotes includes checksum verification guidance", () => {
  const report = buildDesktopTrustReport({});
  const notes = renderDesktopTrustNotes({ version: "0.2.2", report });
  assert.match(notes, /shasum -a 256 -c ThreadLens-0.2.2-SHA256SUMS.txt/);
  assert.match(notes, /macOS \| unsigned/);
});

test("writeDesktopTrustNotes writes markdown and json outputs", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "threadlens-trust-notes-"));
  const { notesPath, jsonPath } = await writeDesktopTrustNotes({
    version: "0.2.2",
    outDir,
    env: {},
  });

  const notes = await fs.readFile(notesPath, "utf8");
  const payload = JSON.parse(await fs.readFile(jsonPath, "utf8"));

  assert.match(notes, /Desktop release trust notes/);
  assert.equal(payload.version, "0.2.2");
  assert.equal(payload.platforms.macos.status, "unsigned");
});
