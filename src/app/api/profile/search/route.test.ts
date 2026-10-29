import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture as snapshot } from "../../../../lib/profile/fixture.test-dict";

vi.mock("../../../../lib/profile/dict", () => ({ loadDict: async () => snapshot }));
const { GET } = await import("./route");

let n = 0;
const call = (qs: string, headers: Record<string, string> = {}) => GET(new Request(`http://x/api/profile/search?${qs}`, { headers: { "x-forwarded-for": `10.2.0.${++n}`, ...headers } }));

afterEach(() => {
  for (const k of ["SERVICE_TOKEN", "RATE_LIMIT"]) delete process.env[k];
});

describe("profile search", () => {
  it("returns at most 10 items", async () => {
    for (const [type, q] of [["position", "ра"], ["skill", "a"], ["region", "д"], ["specialization", "раз"]]) {
      const res = await call(`type=${type}&q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      const j = await res.json();
      expect(j.type).toBe(type);
      expect(j.items.length).toBeGreaterThan(0);
      expect(j.items.length).toBeLessThanOrEqual(10);
      for (const it of j.items) expect(typeof it.id === "number" && typeof it.name === "string").toBe(true);
    }
  });

  it("finds by prefix and transliteration", async () => {
    expect((await (await call("type=skill&q=Type")).json()).items.map((i: { name: string }) => i.name)).toContain("TypeScript");
    expect((await (await call("type=region&q=Dushanbe")).json()).items.length).toBeGreaterThan(0);
  });

  it("validates params", async () => {
    expect((await call("q=a")).status).toBe(400);
    expect((await call("type=nope&q=a")).status).toBe(400);
    expect((await call("type=skill")).status).toBe(400);
    expect((await call("type=skill&q=")).status).toBe(400);
    expect((await call(`type=skill&q=${"a".repeat(101)}`)).status).toBe(400);
  });

  it("requires the token when SERVICE_TOKEN is set", async () => {
    process.env.SERVICE_TOKEN = "t";
    expect((await call("type=skill&q=a")).status).toBe(401);
    expect((await call("type=skill&q=a", { authorization: "Bearer t" })).status).toBe(200);
  });

  it("rate limits per ip", async () => {
    let last = 0;
    for (let i = 0; i < 241; i++) last = (await GET(new Request("http://x/api/profile/search?type=skill&q=a", { headers: { "x-forwarded-for": "9.9.9.7" } }))).status;
    expect(last).toBe(429);
  });
});
