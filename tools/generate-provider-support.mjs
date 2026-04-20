import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  INTERNAL_PROVIDER_IDS,
  PROVIDER_REGISTRY,
  SEARCHABLE_PROVIDER_IDS,
} from "../packages/shared-contracts/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs", "PROVIDER_SUPPORT.md");

const PROVIDER_PATH_NOTES = {
  codex:
    "reads session logs from `CODEX_HOME` plus detected Codex home mirrors such as `~/.codex` and `~/.codex-cli`; it is not tied to macOS app-data paths.",
  claude: "reads local session stores from dot-home roots such as `~/.claude`.",
  gemini: "reads local session stores from dot-home roots such as `~/.gemini`.",
  copilot:
    "resolves local app-data roots by platform: macOS `~/Library/Application Support`, Windows `%APPDATA%`, and Linux `XDG_CONFIG_HOME` or `~/.config`.",
  chatgpt:
    "reads the local desktop cache for the installed app; this provider remains read-only and stays outside the default search and cleanup flow.",
};

const PROVIDER_WORKFLOW_NOTES = {
  codex: [
    "Central thread model with pinned state, archives, and cleanup review.",
    "`Thread` is the main Codex workflow.",
    "Session transcripts also appear in `Sessions`.",
  ],
  claude: [
    "Session-file oriented workflow.",
    "Best used through `Search` and `Sessions`.",
    "File-level archive and delete actions follow dry-run and confirm-token rules.",
  ],
  gemini: [
    "Session data may live across multiple local stores.",
    "Search and session inspection are supported.",
    "File-level archive and delete actions depend on detected local data.",
  ],
  copilot: [
    "Reads local chat artifacts from supported local stores.",
    "Useful for search, transcript inspection, and session-file workflows.",
    "It does not use the dedicated Codex cleanup path.",
  ],
  chatgpt: [
    "Read-only desktop cache source.",
    "Useful for desktop cache discovery and provider diagnostics.",
    "Excluded from the default search scope and destructive cleanup workflow.",
  ],
};

function yesNo(value) {
  return value ? "Yes" : "No";
}

function sessionActionSummary(provider) {
  if (!provider.read_sessions) {
    return "No";
  }
  if (!provider.safe_cleanup) {
    return "Read-only";
  }
  if (provider.hard_delete) {
    return "Yes";
  }
  return "Partial";
}

function buildCapabilityTable() {
  const header = [
    "| Provider | Category | Search scope | Sessions | Transcript | Analyze | Safe cleanup | Hard delete | Thread review |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const rows = PROVIDER_REGISTRY.map((provider) =>
    [
      provider.label,
      provider.docs_visibility === "public" ? "primary workflow" : "read-only cache source",
      provider.search_scope_visibility,
      yesNo(provider.read_sessions),
      yesNo(provider.read_transcript),
      yesNo(provider.analyze_context),
      yesNo(provider.safe_cleanup),
      yesNo(provider.hard_delete),
      yesNo(provider.thread_review),
    ].join(" | "),
  ).map((row) => `| ${row} |`);
  return [...header, ...rows].join("\n");
}

function buildWorkflowSummaryTable() {
  const header = [
    "| Provider | Search / transcript workflow | Session archive / delete workflow | Dedicated thread review |",
    "| --- | --- | --- | --- |",
  ];
  const rows = PROVIDER_REGISTRY.map((provider) => {
    const searchSummary =
      provider.search_scope_visibility === "public"
        ? "Public workflow"
        : provider.search_scope_visibility === "internal"
          ? "Cache-only provider inspection"
          : "No";
    return `| ${provider.label} | ${searchSummary}${provider.read_transcript ? " + transcript read" : ""} | ${sessionActionSummary(provider)} | ${yesNo(provider.thread_review)} |`;
  });
  return [...header, ...rows].join("\n");
}

function buildProviderNotes() {
  return PROVIDER_REGISTRY.map((provider) => {
    const notes = PROVIDER_WORKFLOW_NOTES[provider.id] ?? [];
    return [`### ${provider.label}`, "", ...notes.map((note) => `- ${note}`), ""].join("\n");
  }).join("\n");
}

function buildPathNotes() {
  return PROVIDER_REGISTRY.map((provider) => `- \`${provider.label}\` ${PROVIDER_PATH_NOTES[provider.id]}`).join(
    "\n",
  );
}

function buildGuideList() {
  const publicScope = SEARCHABLE_PROVIDER_IDS.map((providerId) =>
    PROVIDER_REGISTRY.find((provider) => provider.id === providerId)?.label,
  ).filter(Boolean);
  const internalScope = INTERNAL_PROVIDER_IDS.map((providerId) =>
    PROVIDER_REGISTRY.find((provider) => provider.id === providerId)?.label,
  ).filter(Boolean);
  return {
    publicScope,
    internalScope,
  };
}

async function main() {
  const { publicScope, internalScope } = buildGuideList();
  const content = `# Provider Support

_Generated from \`packages/shared-contracts/src/index.ts\`. Do not hand-edit this file; run \`pnpm docs:provider-support\`._

ThreadLens reads local conversation data from multiple provider-specific stores.
This document distinguishes between:

- \`primary workflow providers\` used in the main search, sessions, and cleanup flows
- \`read-only cache sources\` that can still appear in diagnostics or provider-specific inspection

The primary search/session workflow currently covers ${publicScope.map((label) => `\`${label}\``).join(", ")}.
${internalScope.length > 0 ? `${internalScope.map((label) => `\`${label}\``).join(", ")} is currently treated as a read-only desktop cache source. It remains available to the provider registry, but stays outside the default search scope and destructive cleanup workflow.` : ""}

## Capability Registry

${buildCapabilityTable()}

## Workflow Summary

${buildWorkflowSummaryTable()}

## Local Path Notes

${buildPathNotes()}

## Provider Notes

${buildProviderNotes()}

## Workflow Guide

- Use \`Search\` when you do not know which ${publicScope.join(", ")} session owns the conversation yet.
- Use \`Sessions\` for provider file inspection and session-file actions.
- Use \`Thread\` only for Codex thread review and execution.

## TUI Note

The terminal workbench follows the same core search scope used in the web workbench:
${publicScope.map((label) => `\`${label}\``).join(", ")}.
`;

  await writeFile(outputPath, `${content.trim()}\n`, "utf8");
  console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
