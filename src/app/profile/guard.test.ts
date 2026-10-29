import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
const { guard } = await import("./guard");

afterEach(() => delete process.env.SERVICE_MODE);

describe("profile pages in service mode", () => {
  it("are 404 when SERVICE_MODE=1", async () => {
    process.env.SERVICE_MODE = "1";
    await expect(guard()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("render otherwise", async () => {
    await expect(guard()).resolves.toBeUndefined();
  });
});
