import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatStyles = readFileSync(new URL("../styles/chat.css", import.meta.url), "utf8");

describe("chat token migration", () => {
  it("uses typography and blur tokens for transcript surfaces", () => {
    expect(chatStyles).toMatch(/\.transcript-summary-main strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(chatStyles).toMatch(/\.detail-action-bar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\);/s);
    expect(chatStyles).toMatch(/\.chat-item header strong\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(chatStyles).toMatch(/\.chat-item header span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(chatStyles).toMatch(/\.chat-item p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
  });

  it("uses semantic tokens for transcript summary and action surfaces", () => {
    expect(chatStyles).toMatch(/\.transcript-summary-strip\s*{[^}]*background:\s*var\(--surface-transcript-summary-strip\);/s);
    expect(chatStyles).toMatch(/\.detail-action-bar\s*{[^}]*background:\s*var\(--surface-chat-action-bar\);/s);
    expect(chatStyles).not.toMatch(/\.chat-item\.role-user\s*{[^}]*border-left-width:/s);
    expect(chatStyles).not.toMatch(/\.chat-item\.role-assistant\s*{[^}]*border-left-width:/s);
  });
});
