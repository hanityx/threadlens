import { describe, expect, it } from "vitest";
import {
  canonicalizeQuery,
  parseNumber,
  parseQueryNumber,
  parseQueryString,
} from "./query.js";

describe("query helpers", () => {
  it("parses scalar and array query strings", () => {
    expect(parseQueryString("alpha")).toBe("alpha");
    expect(parseQueryString(["alpha", "beta"])).toBe("alpha");
    expect(parseQueryString(undefined)).toBe("");
  });

  it("falls back when numeric query values are invalid", () => {
    expect(parseQueryNumber("42", 1)).toBe(42);
    expect(parseQueryNumber("nope", 7)).toBe(7);
    expect(parseNumber("5", 0)).toBe(5);
    expect(parseNumber("nan", 9)).toBe(9);
  });

  it("canonicalizes query keys and array values", () => {
    expect(
      canonicalizeQuery({
        b: "two words",
        a: ["z", "x"],
        skip: undefined,
      }),
    ).toBe("a=x&a=z&b=two%20words");
  });
});
