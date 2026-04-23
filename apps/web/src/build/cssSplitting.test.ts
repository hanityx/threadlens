import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_SRC = fileURLToPath(new URL("..", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_SRC, relativePath), "utf8");
}

describe("feature CSS entry points", () => {
  it("keeps main.tsx limited to shared CSS", () => {
    const mainSource = readSource("main.tsx");

    expect(mainSource).toContain('import "@/shared/ui/index.css";');
    expect(mainSource).not.toContain('import "@/features/overview/overview.css";');
    expect(mainSource).not.toContain('import "@/features/threads/threads.css";');
    expect(mainSource).not.toContain('import "@/features/providers/providers.css";');
    expect(mainSource).not.toContain('import "@/features/search/search.css";');
    expect(mainSource).not.toContain('import "@/features/providers/routing/routing.css";');
  });

  it("loads feature CSS from lazy route boundaries", () => {
    expect(readSource("features/overview/components/OverviewWorkbench.tsx")).toContain(
      'import "@/features/overview/overview.css";',
    );
    expect(readSource("features/search/components/SearchRoute.tsx")).toContain(
      'import "@/features/search/search.css";',
    );
    expect(readSource("features/threads/components/ThreadsWorkbench.tsx")).toContain(
      'import "@/features/threads/threads.css";',
    );
    expect(readSource("features/providers/components/ProvidersWorkspace.tsx")).toContain(
      'import "@/features/providers/providers.css";',
    );
    expect(readSource("features/providers/routing/RoutingPanel.tsx")).toContain(
      'import "@/features/providers/routing/routing.css";',
    );
  });

  it("co-locates large providers CSS blocks with their owning components", () => {
    expect(readSource("features/providers/components/BackupHub.tsx")).toContain(
      'import "./backupHub.css";',
    );
    expect(readSource("features/providers/components/ProviderWorkspaceBar.tsx")).toContain(
      'import "./providerWorkspaceBar.css";',
    );
    expect(readSource("features/providers/components/AiManagementMatrix.tsx")).toContain(
      'import "./aiManagementMatrix.css";',
    );
    expect(readSource("features/providers/components/SessionTable.tsx")).toContain(
      'import "./sessionTable.css";',
    );
    expect(readSource("features/providers/components/ProviderAdvancedShell.tsx")).toContain(
      'import "./providerAdvanced.css";',
    );
    expect(readSource("features/providers/components/ProviderAdvancedTools.tsx")).toContain(
      'import "./providerAdvanced.css";',
    );
  });

  it("keeps providers.css focused on shared providers surface styles", () => {
    const providersCss = readSource("features/providers/providers.css");

    expect(providersCss).not.toContain(".provider-backup-center {");
    expect(providersCss).not.toContain(".provider-workspace-bar {");
    expect(providersCss).not.toContain(".ai-management-intro {");
    expect(providersCss).not.toMatch(/^\.provider-session-stage\s*{/m);
    expect(providersCss).not.toContain(".provider-advanced-shell {");
  });
});
