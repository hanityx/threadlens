import { describe, expect, it } from "vitest";
import {
  SESSION_TRANSCRIPT_INITIAL_LIMIT,
  THREAD_TRANSCRIPT_INITIAL_LIMIT,
} from "./useDetailData";

describe("useDetailData transcript limits", () => {
  it("keeps the session transcript initial limit below the thread transcript default", () => {
    expect(SESSION_TRANSCRIPT_INITIAL_LIMIT).toBe(40);
    expect(SESSION_TRANSCRIPT_INITIAL_LIMIT).toBeLessThan(THREAD_TRANSCRIPT_INITIAL_LIMIT);
  });
});
