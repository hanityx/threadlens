export type StatusTone = "idle" | "running" | "pending" | "success" | "error";

export function statusToneColor(tone: StatusTone): "gray" | "yellow" | "green" | "red" {
  if (tone === "running" || tone === "pending") return "yellow";
  if (tone === "success") return "green";
  if (tone === "error") return "red";
  return "gray";
}
