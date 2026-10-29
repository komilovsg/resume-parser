import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture as snapshot } from "../../../../lib/profile/fixture.test-dict";

vi.mock("../../../../lib/profile/dict", () => ({ loadDict: async () => snapshot }));
const { GET } = await import("./route");

let n = 0;
const call = (headers: Record<string, string> = {}) => GET(new Request("http://x/api/profile/dict", { headers: { "x-forwarded-for": `10.3.0.${++n}`, ...headers } }));

afterEach(() => {
  delete process.env.SERVICE_TOKEN;
});

describe("profile dict", () => {
  it("has the form dictionaries with cache headers", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    const j = await res.json();
    for (const k of ["employment", "workSchedule", "timeToWork", "businessTrips", "currencies", "salaryPeriod"]) {
      expect(j[k].length).toBeGreaterThan(0);
      expect(j[k][0]).toMatchObject({ id: expect.any(Number), code: expect.any(String), name: expect.any(String) });
    }
    expect(j.regions[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    expect(j.specializations.length).toBeGreaterThan(0);
    expect(JSON.stringify(j.timeToWork)).not.toContain("полутрочасов");
    expect(j.positions).toBeUndefined();
  });

  it("requires the token when SERVICE_TOKEN is set", async () => {
    process.env.SERVICE_TOKEN = "t";
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer t" })).status).toBe(200);
  });
});
