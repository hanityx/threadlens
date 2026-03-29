import { describe, expect, it } from "vitest";
import { shouldResetProviderView } from "./useProvidersData";

describe("shouldResetProviderView", () => {
  it("does not reset a saved provider while overview is hydrating", () => {
    expect(
      shouldResetProviderView({
        layoutView: "overview",
        providerView: "gemini",
        providerTabs: [{ id: "all" }, { id: "codex" }],
        providerMatrixLoading: true,
        providerSessionsLoading: true,
        parserLoading: true,
      }),
    ).toBe(false);
  });

  it("resets to all only inside providers when the chosen provider is truly absent", () => {
    expect(
      shouldResetProviderView({
        layoutView: "providers",
        providerView: "gemini",
        providerTabs: [{ id: "all" }, { id: "codex" }, { id: "claude" }],
        providerMatrixLoading: false,
        providerSessionsLoading: false,
        parserLoading: false,
      }),
    ).toBe(true);
  });
});
