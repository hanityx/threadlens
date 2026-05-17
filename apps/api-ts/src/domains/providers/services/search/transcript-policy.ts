export function isPolicyInjectionMessage(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("# AGENTS.md instructions for") ||
    t.startsWith("<INSTRUCTIONS>") ||
    t.startsWith("<permissions instructions>") ||
    /^You are (Codex|Assist|Claude|Gemini|Copilot)\b/i.test(t) ||
    (t.startsWith("# ") && t.includes("<INSTRUCTIONS>"))
  );
}
