import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateAlertHooksTs,
  getAlertHooksTs,
  type AlertHooksConfig,
  readAlertHookEvents,
  updateAlertHookRuleTs,
  updateAlertHooksConfigTs,
} from "./alert-hooks.js";

function buildDeps(
  root: string,
  options?: {
    now?: () => Date;
    notifier?: (title: string, message: string) => void | Promise<void>;
  },
) {
  const configFilePath = path.join(root, "state", "alert_rules.json");
  const stateFilePath = path.join(root, "state", "alert_state.json");
  const eventsFilePath = path.join(root, "state", "alert_events.jsonl");
  const overviewLoader = vi.fn(
    async ({ forceRefresh }: { forceRefresh?: boolean }) => ({
      generated_at: "2026-03-14T00:00:00.000Z",
      force_refresh_seen: Boolean(forceRefresh),
      summary: {
        thread_total: 42,
        high_risk_threads: 9,
      },
      risk_summary: {
        ctx_high_total: 40,
        orphan_candidates: 55,
      },
    }),
  );
  const runtimeHealthLoader = vi.fn(async () => ({
    generated_at: "2026-03-14T00:00:00.000Z",
    score: 61,
    summary: {
      fail: 2,
      warn: 3,
    },
  }));
  const observatoryLoader = vi.fn(
    async ({ forceRefresh }: { forceRefresh?: boolean }) => ({
      generated_at: "2026-03-14T00:00:00.000Z",
      force_refresh_seen: Boolean(forceRefresh),
      summary: {
        loop_attention_total: 2,
        process_total: 11,
        class_counts: {},
      },
      process_groups: [
        { signature: "omx-mcp:claude", count: 4 },
        { signature: "omx-mcp:gemini", count: 2 },
      ],
    }),
  );
  return {
    configFilePath,
    stateFilePath,
    eventsFilePath,
    overviewLoader,
    runtimeHealthLoader,
    observatoryLoader,
    now: options?.now,
    desktopNotifier: options?.notifier,
  };
}

async function readConfig(filePath: string): Promise<AlertHooksConfig> {
  return JSON.parse(await readFile(filePath, "utf-8")) as AlertHooksConfig;
}

describe("alert hooks domain", () => {
  it("bootstraps default config and returns evaluated data for GET behavior", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-alert-hooks-"));
    const deps = buildDeps(root);

    const data = await getAlertHooksTs({ forceRefresh: true }, deps);

    expect(data.config.rules).toHaveLength(5);
    expect(data.active_alerts).toHaveLength(5);
    expect(data.metrics.health_score).toBe(61);
    expect(data.metrics.health_fail).toBe(2);
    expect(data.metrics.health_warn).toBe(3);
    expect(data.metrics.mcp_duplicate_groups).toBe(1);
    expect(data.metrics.codex_main_missing).toBe(1);
    expect(data.emitted_events).toHaveLength(0);
    expect(deps.overviewLoader).toHaveBeenCalledWith({
      includeThreads: false,
      forceRefresh: true,
    });

    const savedConfig = await readConfig(deps.configFilePath);
    expect(savedConfig.desktop_notify).toBe(false);
    expect(savedConfig.rules.map((rule) => rule.id)).toContain("high_risk_threads");
  });

  it("updates desktop_notify and returns fresh evaluated data", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-alert-hooks-config-"));
    const deps = buildDeps(root);

    const result = await updateAlertHooksConfigTs({ desktop_notify: true }, deps);

    expect(result.ok).toBe(true);
    expect(result.config.desktop_notify).toBe(true);
    expect(result.data.config.desktop_notify).toBe(true);

    const savedConfig = await readConfig(deps.configFilePath);
    expect(savedConfig.desktop_notify).toBe(true);
  });

  it("updates a rule and rejects invalid rule changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-alert-hooks-rule-"));
    const deps = buildDeps(root);
    await getAlertHooksTs({}, deps);

    const invalid = await updateAlertHookRuleTs(
      { rule_id: "missing-rule", threshold: 1 },
      deps,
    );
    expect(invalid).toEqual({
      ok: false,
      error: "rule not found or no valid changes",
    });

    const updated = await updateAlertHookRuleTs(
      {
        rule_id: "high_risk_threads",
        enabled: false,
        threshold: 12,
        cooldown_min: 45,
      },
      deps,
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      const rule = updated.data.config.rules.find(
        (item) => item.id === "high_risk_threads",
      );
      expect(rule).toMatchObject({
        enabled: false,
        threshold: 12,
        cooldown_min: 45,
      });
      expect(
        updated.data.active_alerts.some(
          (item) => item.rule_id === "high_risk_threads",
        ),
      ).toBe(false);
    }
  });

  it("emits events with cooldown protection and persists state/event files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-alert-hooks-eval-"));
    const notifyMock = vi.fn();
    const nowRef = { value: new Date("2026-03-14T00:00:00.000Z") };
    const deps = buildDeps(root, {
      now: () => nowRef.value,
      notifier: notifyMock,
    });
    await updateAlertHooksConfigTs({ desktop_notify: true }, deps);

    const first = await evaluateAlertHooksTs(
      { forceRefresh: false, emitEvents: true },
      deps,
    );
    expect(first.active_alerts).toHaveLength(5);
    expect(first.emitted_events).toHaveLength(5);
    expect(notifyMock).toHaveBeenCalledTimes(5);

    nowRef.value = new Date("2026-03-14T00:10:00.000Z");
    const second = await evaluateAlertHooksTs(
      { forceRefresh: false, emitEvents: true },
      deps,
    );
    expect(second.active_alerts).toHaveLength(5);
    expect(second.emitted_events).toHaveLength(0);

    const events = await readAlertHookEvents(120, deps);
    expect(events).toHaveLength(5);

    const savedState = JSON.parse(await readFile(deps.stateFilePath, "utf-8")) as {
      last_fired_at: Record<string, string>;
      last_values: Record<string, number>;
    };
    expect(Object.keys(savedState.last_fired_at)).toHaveLength(5);
    expect(savedState.last_values.high_risk_threads).toBe(9);
    expect(savedState.last_values.health_score_low).toBe(61);
  });

  it("ignores malformed alert event lines when reading recent events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-alert-hooks-events-"));
    const deps = buildDeps(root);
    await mkdir(path.dirname(deps.eventsFilePath), { recursive: true });
    await writeFile(
      deps.eventsFilePath,
      [
        "{\"ts\":\"2026-03-14T00:00:00.000Z\",\"rule_id\":\"a\"}",
        "not-json",
        "{\"ts\":\"2026-03-14T00:01:00.000Z\",\"rule_id\":\"b\"}",
      ].join("\n"),
      "utf-8",
    );

    const events = await readAlertHookEvents(120, deps);

    expect(events).toHaveLength(2);
    expect(events.map((item) => item.rule_id)).toEqual(["a", "b"]);
  });
});
