import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/parser", async (orig) => ({
  ...(await orig<typeof import("../../lib/parser")>()),
  parseResume: vi.fn(async () => {
    const { ParseError } = await import("../../lib/parser");
    throw new ParseError("unsupported", "nope");
  }),
}));

const parse = await import("./parse/route");
const profile = await import("./profile/route");
const health = await import("./health/route");

let n = 0;
const form = () => {
  const f = new FormData();
  f.set("file", new File(["x"], "a.txt"));
  return f;
};
const req = (url: string, init: RequestInit = {}) =>
  new Request(url, { method: "POST", ...init, headers: { "x-forwarded-for": `10.1.0.${++n}`, ...init.headers } });

afterEach(() => {
  for (const k of ["SERVICE_MODE", "SERVICE_TOKEN", "RATE_LIMIT"]) delete process.env[k];
});

describe("service mode", () => {
  it("health is public and has no secrets", async () => {
    process.env.SERVICE_TOKEN = "t";
    process.env.AI_API_KEY = "secret-key";
    const j = await health.GET().json();
    expect(j.ok).toBe(true);
    expect(JSON.stringify(j)).not.toContain("secret-key");
  });
});

describe("bearer auth", () => {
  it("401 without or with wrong token, passes with right one", async () => {
    process.env.SERVICE_TOKEN = "secret";
    expect((await parse.POST(req("http://x/api/parse", { body: form() }))).status).toBe(401);
    expect((await profile.POST(req("http://x/api/profile", { body: "{}" }))).status).toBe(401);
    const bad = await parse.POST(req("http://x/api/parse", { body: form(), headers: { authorization: "Bearer secreu" } }));
    expect(bad.status).toBe(401);
    const ok = await profile.POST(req("http://x/api/profile", { body: "{}", headers: { authorization: "Bearer secret" } }));
    expect(ok.status).toBe(400); // прошла авторизацию, упала на валидации
  });

  it("no token configured -> open", async () => {
    expect((await profile.POST(req("http://x/api/profile", { body: "{}" }))).status).toBe(400);
  });
});

describe("stream=0", () => {
  it("returns JSON error shape with HTTP status", async () => {
    const r = await parse.POST(req("http://x/api/parse?stream=0", { body: form() }));
    expect(r.status).toBe(415);
    expect(await r.json()).toEqual({ error: { code: "unsupported", message: "nope" } });
    const r2 = await parse.POST(req("http://x/api/parse", { body: form(), headers: { accept: "application/json" } }));
    expect(r2.headers.get("content-type")).toContain("application/json");
  });

  it("default stays NDJSON", async () => {
    const r = await parse.POST(req("http://x/api/parse", { body: form() }));
    expect(r.headers.get("content-type")).toContain("ndjson");
  });
});

describe("RATE_LIMIT", () => {
  it("0 disables", async () => {
    process.env.RATE_LIMIT = "0";
    const ip = { "x-forwarded-for": "7.7.7.7" };
    let last = 0;
    for (let i = 0; i < 15; i++) last = (await profile.POST(new Request("http://x", { method: "POST", headers: ip, body: "{}" }))).status;
    expect(last).toBe(400);
  });
  it("custom limit applies", async () => {
    process.env.RATE_LIMIT = "2";
    const ip = { "x-forwarded-for": "8.8.8.8" };
    const s: number[] = [];
    for (let i = 0; i < 3; i++) s.push((await profile.POST(new Request("http://x", { method: "POST", headers: ip, body: "{}" }))).status);
    expect(s).toEqual([400, 400, 429]);
  });
});
