import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAC_NOTARIZE_ENV_SETS = [
  ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
  ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  ["APPLE_KEYCHAIN", "APPLE_KEYCHAIN_PROFILE"],
];

function hasAll(env, keys) {
  return keys.every((key) => Boolean(env[key]));
}

function hasMacSigning(env) {
  return Boolean(env.CSC_NAME) || hasAll(env, ["CSC_LINK", "CSC_KEY_PASSWORD"]);
}

function hasMacNotarization(env) {
  return MAC_NOTARIZE_ENV_SETS.some((keys) => hasAll(env, keys));
}

function hasWindowsSigning(env) {
  return hasAll(env, ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"]) || hasAll(env, ["CSC_LINK", "CSC_KEY_PASSWORD"]);
}

export function buildDesktopTrustReport(env = process.env) {
  const macSigned = hasMacSigning(env);
  const macNotarized = macSigned && hasMacNotarization(env);
  const windowsSigned = hasWindowsSigning(env);

  return {
    macos: {
      signed: macSigned,
      notarized: macNotarized,
      status: macNotarized ? "signed-and-notarized" : macSigned ? "signed-only" : "unsigned",
      verification: macNotarized
        ? "Code signature + Apple notarization + checksum"
        : macSigned
          ? "Code signature + checksum"
          : "Checksum only",
      requiredSecrets: {
        signing: ["CSC_LINK", "CSC_KEY_PASSWORD"],
        signingAlternative: ["CSC_NAME"],
        notarizationOptions: MAC_NOTARIZE_ENV_SETS,
      },
    },
    windows: {
      signed: windowsSigned,
      status: windowsSigned ? "signed" : "unsigned",
      verification: windowsSigned ? "Authenticode signature + checksum" : "Checksum only",
      requiredSecrets: {
        signingPrimary: ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"],
        signingFallback: ["CSC_LINK", "CSC_KEY_PASSWORD"],
      },
    },
    linux: {
      signed: false,
      status: "checksum-only",
      verification: "Checksum only",
      requiredSecrets: null,
    },
  };
}

export function renderDesktopTrustNotes({ version, report }) {
  return `# Desktop release trust notes

Release version: ${version}

## Trust status

| Platform | Status | Verification chain | First-launch guidance |
| --- | --- | --- | --- |
| macOS | ${report.macos.status} | ${report.macos.verification} | ${report.macos.status === "unsigned" ? "Gatekeeper can require Control-click -> Open once." : report.macos.status === "signed-only" ? "Signature is present. If Gatekeeper still warns, verify the checksum and publisher details." : "Signature and notarization are present. Verify the checksum before launch."} |
| Windows | ${report.windows.status} | ${report.windows.verification} | ${report.windows.status === "unsigned" ? "SmartScreen can require More info -> Run anyway once." : "Signature is present. Verify the checksum and signer details before launch."} |
| Linux | ${report.linux.status} | ${report.linux.verification} | Run \`chmod +x ThreadLens-*.AppImage\` before launch. |

## Release verification

1. Download the platform artifact and \`ThreadLens-${version}-SHA256SUMS.txt\`.
2. Run \`shasum -a 256 -c ThreadLens-${version}-SHA256SUMS.txt\`.
3. Then apply the platform guidance above.

## Signing readiness

- macOS signing uses \`CSC_LINK\` + \`CSC_KEY_PASSWORD\` or \`CSC_NAME\`.
- macOS notarization additionally requires one of:
  - \`APPLE_API_KEY\` + \`APPLE_API_KEY_ID\` + \`APPLE_API_ISSUER\`
  - \`APPLE_ID\` + \`APPLE_APP_SPECIFIC_PASSWORD\` + \`APPLE_TEAM_ID\`
  - \`APPLE_KEYCHAIN\` + \`APPLE_KEYCHAIN_PROFILE\`
- Windows signing uses \`WIN_CSC_LINK\` + \`WIN_CSC_KEY_PASSWORD\` or falls back to \`CSC_LINK\` + \`CSC_KEY_PASSWORD\`.
`;
}

export async function writeDesktopTrustNotes({ version, outDir, env = process.env }) {
  const report = buildDesktopTrustReport(env);
  const notes = renderDesktopTrustNotes({ version, report });
  const notesPath = path.join(outDir, `ThreadLens-${version}-desktop-trust-notes.md`);
  const jsonPath = path.join(outDir, `ThreadLens-${version}-desktop-trust.json`);
  const payload = {
    version,
    generated_at: new Date().toISOString(),
    platforms: report,
  };

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(notesPath, notes);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  return { notesPath, jsonPath, report };
}

function parseArgs(argv) {
  const args = { version: "", outDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--version") {
      args.version = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--out") {
      args.outDir = argv[index + 1] ?? "";
      index += 1;
    }
  }
  return args;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entrypoint === fileURLToPath(import.meta.url)) {
  const { version, outDir } = parseArgs(process.argv.slice(2));
  if (!version || !outDir) {
    console.error("Usage: node tools/generate-desktop-trust-notes.mjs --version <version> --out <dir>");
    process.exit(1);
  }

  await writeDesktopTrustNotes({ version, outDir });
}
