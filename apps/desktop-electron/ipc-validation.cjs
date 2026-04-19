const fs = require("node:fs");
const path = require("node:path");

function requireTrimmedString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function requirePathString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  if (!value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  return value;
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseFileActionPayload(payload) {
  const action = requireTrimmedString(payload?.action, "File action");
  if (!["reveal", "open", "preview"].includes(action)) {
    throw new Error(`Unsupported file action: ${action}`);
  }
  const filePath = requirePathString(payload?.filePath, "File path");
  return { action, filePath };
}

function parseOpenWindowPayload(payload) {
  return {
    view: normalizeOptionalString(payload?.view),
    provider: normalizeOptionalString(payload?.provider),
    filePath: typeof payload?.filePath === "string" ? payload.filePath : "",
    threadId: normalizeOptionalString(payload?.threadId),
  };
}

function resolveExistingPath(filePath) {
  const preserved = requirePathString(filePath, "File path");
  const resolved = path.resolve(preserved);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  return resolved;
}

module.exports = {
  normalizeOptionalString,
  parseFileActionPayload,
  parseOpenWindowPayload,
  requirePathString,
  requireTrimmedString,
  resolveExistingPath,
};
