import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import { BackupHub, type BackupHubProps } from "./BackupHub";

const messages = getMessages("en");

function buildProps(overrides: Partial<BackupHubProps> = {}): BackupHubProps {
  return {
    messages,
    selectedProviderFilePathsCount: 2,
    availableBackupSets: 1,
    canRunProviderBackup: true,
    backupPending: false,
    exportPending: false,
    onRunBackupSelected: () => undefined,
    onRunBackupSelectedExport: () => undefined,
    onRunRecoveryBackupExport: () => undefined,
    backupRoot: "/tmp/backups",
    exportRoot: "/tmp/exports",
    onBackupRootChange: () => undefined,
    onExportRootChange: () => undefined,
    onResetBackupRoot: () => undefined,
    onResetExportRoot: () => undefined,
    latestBackupPath: "/tmp/backups/provider_actions/codex/latest",
    backupFolderHint: "Backups land here.",
    latestExportPath: "/tmp/exports/latest-export.zip",
    backupSelectionHint: "",
    backupActionResult: null,
    ...overrides,
  };
}

describe("BackupHub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows folder actions through the desktop bridge and keeps delete toggle out of the backup vault", () => {
    vi.stubGlobal("window", {
      threadLensDesktop: {
        openPath: vi.fn(),
        pickDirectory: vi.fn(),
      },
    });

    const html = renderToStaticMarkup(<BackupHub {...buildProps()} />);

    expect(html).toContain(messages.sessionDetail.openFolder);
    expect(html).not.toContain(messages.providers.deleteWithBackup);
  });

  it("anchors folder actions beside the backup and export action buttons instead of the latest-result rows", () => {
    vi.stubGlobal("window", {});

    const html = renderToStaticMarkup(<BackupHub {...buildProps()} />);

    expect(html.indexOf(messages.providers.backupSelected)).toBeLessThan(
      html.indexOf(messages.sessionDetail.openFolder),
    );
    expect(html.indexOf(messages.providers.exportAllBackups)).toBeLessThan(
      html.lastIndexOf(messages.sessionDetail.openFolder),
    );
  });

  it("disables export until a saved backup set exists", () => {
    vi.stubGlobal("window", {});

    const html = renderToStaticMarkup(
      <BackupHub {...buildProps({ availableBackupSets: 0 })} />,
    );

    expect(html).toContain(`${messages.providers.backupSetsAvailable}</strong><span>0</span>`);
    expect(html).toContain(`disabled="">${messages.providers.exportAllBackups}</button>`);
  });

  it("shows a direct ZIP action for selected sessions", () => {
    vi.stubGlobal("window", {});

    const html = renderToStaticMarkup(<BackupHub {...buildProps()} />);

    expect(html).toContain(messages.providers.backupSelectedExport);
  });

  it("still shows folder actions when the desktop bridge is unavailable", () => {
    vi.stubGlobal("window", {});

    const html = renderToStaticMarkup(<BackupHub {...buildProps()} />);

    expect(html).toContain(messages.sessionDetail.openFolder);
  });

  it("shows a legacy backup section when old backup sets are still present", () => {
    vi.stubGlobal("window", {});
    const props = {
      ...buildProps(),
      legacyBackupSets: [
        {
          backup_id: "provider_actions/codex/legacy-1",
          path: "/Users/example/.codex/local_cleanup_backups/provider_actions/codex/legacy-1",
          file_count: 2,
          total_bytes: 256,
          latest_mtime: "2026-04-24T06:00:00.000Z",
        },
      ],
    } as unknown as BackupHubProps;

    const html = renderToStaticMarkup(<BackupHub {...props} />);

    expect(html).toContain("Older backups");
    expect(html).toContain('class="provider-backup-legacy-block"');
    expect(html).not.toContain('class="provider-backup-legacy-block" open=""');
    expect(html).toContain("/Users/example/.codex/local_cleanup_backups/provider_actions/codex/legacy-1");
  });

  it("shows grouped backup progress while multi-provider backup is running", () => {
    vi.stubGlobal("window", {});
    const props = {
      ...buildProps({
        backupPending: true,
      }),
      groupedBackupProgress: {
        current: 1,
        total: 3,
        providerLabel: "Codex",
      },
    } as unknown as BackupHubProps;

    const html = renderToStaticMarkup(<BackupHub {...props} />);

    expect(html).toContain("Saving... (Codex 1/3)");
  });
});
