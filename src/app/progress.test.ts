import { describe, expect, it } from "vitest";
import { target } from "./progress";

describe("target", () => {
  it("upload 0 -> 0, 1 -> 15", () => {
    expect(target("upload", 0, 0, 0)).toBe(0);
    expect(target("upload", 1, 0, 0)).toBe(15);
  });
  it("ai never reaches 90", () => {
    const v = target("ai", 1, 0, 600_000);
    expect(v).toBeLessThan(90);
    expect(v).toBeGreaterThan(80);
  });
  it("retry continues from ai time", () => {
    expect(target("retry", 1, 0, 5000)).toBe(target("ai", 1, 0, 5000));
  });
  it("matching >= 90, done = 100", () => {
    expect(target("matching", 1, 0, 0)).toBeGreaterThanOrEqual(90);
    expect(target("done", 1, 0, 0)).toBe(100);
  });
});
