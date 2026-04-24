import { describe, expect, it, vi } from "vitest";

const mockGetOverviewTs = vi.hoisted(() => vi.fn());

vi.mock("./overview.js", () => ({
  getOverviewTs: mockGetOverviewTs,
}));

import { getThreadsTs } from "./query.js";

describe("getThreadsTs", () => {
  it("sorts by recent activity age for activity toggles", async () => {
    mockGetOverviewTs.mockResolvedValue({
      threads: [
        { thread_id: "old", title: "Old", risk_score: 10, activity_age_min: 90, timestamp: "2026-01-01T00:00:00.000Z" },
        { thread_id: "fresh", title: "Fresh", risk_score: 10, activity_age_min: 3, timestamp: "2026-01-03T00:00:00.000Z" },
        { thread_id: "mid", title: "Mid", risk_score: 10, activity_age_min: 30, timestamp: "2026-01-02T00:00:00.000Z" },
      ],
    });

    const result = await getThreadsTs({
      offset: "0",
      limit: "80",
      q: "",
      sort: "activity_asc",
    });

    expect(result.rows.map((row) => row.thread_id)).toEqual(["fresh", "mid", "old"]);
  });

  it("sorts rows with cwd and pinned state for table toggles", async () => {
    mockGetOverviewTs.mockResolvedValue({
      threads: [
        { thread_id: "plain", title: "Plain", risk_score: 10, is_pinned: false, timestamp: "2026-01-01T00:00:00.000Z" },
        { thread_id: "work-b", title: "Work B", risk_score: 10, is_pinned: false, cwd: "/b", timestamp: "2026-01-02T00:00:00.000Z" },
        { thread_id: "work-a", title: "Work A", risk_score: 10, is_pinned: true, cwd: "/a", timestamp: "2026-01-03T00:00:00.000Z" },
      ],
    });

    const cwdResult = await getThreadsTs({
      offset: "0",
      limit: "80",
      q: "",
      sort: "cwd_desc",
    });
    const pinnedResult = await getThreadsTs({
      offset: "0",
      limit: "80",
      q: "",
      sort: "pinned_desc",
    });

    expect(cwdResult.rows.map((row) => row.thread_id)).toEqual(["work-b", "work-a", "plain"]);
    expect(pinnedResult.rows.map((row) => row.thread_id)).toEqual(["work-a", "work-b", "plain"]);
  });

  it("sorts by ascending risk for table signal toggles", async () => {
    mockGetOverviewTs.mockResolvedValue({
      threads: [
        { thread_id: "high", title: "High", risk_score: 90, timestamp: "2026-01-03T00:00:00.000Z" },
        { thread_id: "low", title: "Low", risk_score: 10, timestamp: "2026-01-01T00:00:00.000Z" },
        { thread_id: "mid", title: "Mid", risk_score: 50, timestamp: "2026-01-02T00:00:00.000Z" },
      ],
    });

    const result = await getThreadsTs({
      offset: "0",
      limit: "80",
      q: "",
      sort: "risk_asc",
    });

    expect(result.rows.map((row) => row.thread_id)).toEqual(["low", "mid", "high"]);
  });
});
