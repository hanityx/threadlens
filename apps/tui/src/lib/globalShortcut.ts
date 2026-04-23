export function isReservedGlobalShortcut(
  input: string,
  options?: {
    includeUpdateShortcuts?: boolean;
  },
): boolean {
  if (input === "q" || input === "?" || input === "1" || input === "2" || input === "3") {
    return true;
  }
  if (!options?.includeUpdateShortcuts) return false;
  return input === "u" || input === "U";
}
