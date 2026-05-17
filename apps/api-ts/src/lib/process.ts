import { execSync } from "node:child_process";

export function runCmdText(command: string, timeout = 4000): string {
  try {
    const out = execSync(command, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
      shell: "/bin/zsh",
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

export function getTmuxSessions(): string[] {
  const out = runCmdText("tmux ls -F '#S'", 700);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
