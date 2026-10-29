import { describe, expect, it } from "vitest";
import { POST } from "./route";

let n = 0;
const call = (body: unknown, raw = false) =>
  POST(new Request("http://x/api/profile", { method: "POST", headers: { "x-forwarded-for": `10.1.0.${++n}` }, body: raw ? (body as string) : JSON.stringify(body) }));

describe("profile route validation", () => {
  it("rejects invalid JSON", async () => expect((await call("{", true)).status).toBe(400));
  it("rejects missing resume", async () => expect((await call({})).status).toBe(400));
  it("rejects schema-invalid resume", async () => expect((await call({ resume: { fullName: 1 } })).status).toBe(400));
  it("rejects bad month format", async () => {
    const r = { fullName: null, desiredPosition: null, contacts: { email: null, phone: null, city: null, links: [] }, summary: null, salary: { from: null, to: null, currency: null, period: null }, experience: [{ company: null, position: null, city: null, startDate: "2020", endDate: null, current: false, description: null }], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null };
    expect((await call({ resume: r })).status).toBe(400);
  });
  it("rejects body over 200KB", async () => expect((await call({ resume: { fullName: "a".repeat(210_000) } })).status).toBe(413));
  it("rate limits per ip", async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await POST(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "9.9.9.8" }, body: "{}" }))).status;
    expect(last).toBe(429);
  });
});
