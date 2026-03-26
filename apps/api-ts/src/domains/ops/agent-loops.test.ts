import { chmod, mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentLoopSnapshotTs,
  getAgentLoopsStatusTs,
  runAgentLoopActionTs,
} from "./agent-loops.js";

const tempDirs: string[] = [];

async function withTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeExecutable(filePath: string, content: string) {
  await writeFile(filePath, content, "utf-8");
  await chmod(filePath, 0o755);
}

function loopEnv(rootDir: string, controllerPath: string) {
  return {
    ...process.env,
    THREADLENS_LOOP_CONTROLLERS_JSON: JSON.stringify([
      {
        id: "main_loop",
        label: "Main Loop",
        controller: controllerPath,
      },
    ]),
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await rm(dir, { recursive: true, force: true });
  }
});

describe("agent loops domain", () => {
  it("returns an empty payload when no loop controllers are configured", async () => {
    const data = await getAgentLoopsStatusTs({
      env: { ...process.env, THREADLENS_LOOP_CONTROLLERS_JSON: "" },
    });
    expect(data.count).toBe(0);
    expect(data.rows).toEqual([]);
  });

  it("builds a Python-compatible snapshot from controller status and loop state files", async () => {
    const rootDir = await withTempDir("po-agent-loops-");
    const stateDir = path.join(rootDir, "state");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      path.join(stateDir, "current_status.txt"),
      "rid=RID-001\nphase=thinking\nstatus=green\n",
      "utf-8",
    );
    await writeFile(
      path.join(stateDir, "loop_state.txt"),
      "idle\nrunning\n",
      "utf-8",
    );
    await writeFile(
      path.join(stateDir, "cycle_history.tsv"),
      "2026-03-14T00:00:00Z\tok\n2026-03-14T00:01:00Z\tok\n",
      "utf-8",
    );
    await writeFile(
      path.join(stateDir, "latest_summary.txt"),
      "VERDICT=follow-up\nINSTRUCTION=Check recent failures\n",
      "utf-8",
    );
    const staleDate = new Date("2026-03-14T00:00:00.000Z");
    await utimes(path.join(stateDir, "cycle_history.tsv"), staleDate, staleDate);

    const controllerPath = path.join(rootDir, "loop-control.sh");
    await writeExecutable(
      controllerPath,
      `#!/usr/bin/env bash
action="$1"
if [[ "$action" == "status" ]]; then
  cat <<'EOF'
running=yes
live_session=tmux:main-loop
state_dir=${stateDir}
RID=RID-status
EOF
  exit 0
fi
if [[ "$action" == "watch-status" ]]; then
  echo "watchdog offline" >&2
  exit 1
fi
echo "unexpected:$action"
exit 0
`,
    );

    const env = loopEnv(rootDir, controllerPath);
    const snapshot = await getAgentLoopSnapshotTs("main_loop", {
      env,
      projectRoot: rootDir,
      now: () => Date.parse("2026-03-14T01:00:00.000Z") / 1000,
    });

    expect(snapshot.loop_id).toBe("main_loop");
    expect(snapshot.label).toBe("Main Loop");
    expect(snapshot.running).toBe(true);
    expect(snapshot.watchdog_running).toBe(false);
    expect(snapshot.live_session).toBe("tmux:main-loop");
    expect(snapshot.phase).toBe("thinking");
    expect(snapshot.rid).toBe("RID-001");
    expect(snapshot.verdict).toBe("follow-up");
    expect(snapshot.instruction).toBe("Check recent failures");
    expect(snapshot.staleness).toBe("stale");
    expect(snapshot.has_attention).toBe(true);
    expect(snapshot.attention_reasons).toEqual(["history-stale", "watchdog-off"]);
    expect(snapshot.loop_state_line).toBe("running");
    expect(snapshot.history_tail).toHaveLength(2);
    expect(snapshot.summary_kv?.VERDICT).toBe("follow-up");

    const list = await getAgentLoopsStatusTs({
      env,
      projectRoot: rootDir,
      now: () => Date.parse("2026-03-14T01:00:00.000Z") / 1000,
    });
    expect(list.count).toBe(1);
    expect(list.rows[0]?.loop_id).toBe("main_loop");
  });

  it("runs controller actions and returns a refreshed snapshot", async () => {
    const rootDir = await withTempDir("po-agent-loops-action-");
    const stateDir = path.join(rootDir, "state");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      path.join(stateDir, "current_status.txt"),
      "rid=RID-002\nphase=idle\n",
      "utf-8",
    );
    await writeFile(path.join(stateDir, "loop_state.txt"), "idle\n", "utf-8");
    await writeFile(path.join(stateDir, "cycle_history.tsv"), "ok\n", "utf-8");
    await writeFile(path.join(stateDir, "latest_summary.txt"), "FOLLOWUP=Restarted\n", "utf-8");

    const controllerPath = path.join(rootDir, "loop-control.sh");
    await writeExecutable(
      controllerPath,
      `#!/usr/bin/env bash
action="$1"
if [[ "$action" == "status" ]]; then
  cat <<'EOF'
running=no
live_session=
state_dir=${stateDir}
EOF
  exit 0
fi
if [[ "$action" == "watch-status" ]]; then
  exit 0
fi
if [[ "$action" == "restart" ]]; then
  echo "restarted"
  exit 0
fi
echo "unexpected:$action" >&2
exit 2
`,
    );

    const env = loopEnv(rootDir, controllerPath);
    const result = await runAgentLoopActionTs("main_loop", "restart", {
      env,
      projectRoot: rootDir,
      now: () => Date.parse("2026-03-14T01:05:00.000Z") / 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("restart");
    expect(result.result.ok).toBe(true);
    expect(result.result.stdout?.trim()).toBe("restarted");
    expect(result.loop.loop_id).toBe("main_loop");
    expect(result.loop.running).toBe(false);
    expect(result.loop.watchdog_running).toBe(true);
    expect(result.loop.instruction).toBe("Restarted");
  });

  it("returns python-compatible errors for unknown loops", async () => {
    const result = await runAgentLoopActionTs("missing_loop", "status", {
      env: { ...process.env, THREADLENS_LOOP_CONTROLLERS_JSON: "" },
    });

    expect(result.ok).toBe(false);
    expect(result.result.error).toBe("unknown loop_id: missing_loop");
    expect(result.loop).toEqual({
      loop_id: "missing_loop",
      ok: false,
      error: "unknown loop",
    });
  });

});
