import { describe, expect, it, vi } from "vitest";

const calls: { one: number; many: number } = { one: 0, many: 0 };
vi.mock("../../../lib/parser", async (orig) => {
  const real = await orig<typeof import("../../../lib/parser")>();
  const result = (format: string, pages?: number) => ({
    resume: { fullName: "A" },
    meta: { format, ms: 1, model: "m", warnings: [], grounded: false, unverified: [], sourceText: null, ...(pages ? { pages } : {}) },
  });
  return {
    ...real,
    parseResume: vi.fn(async () => (calls.one++, result("jpeg"))),
    parseResumeImages: vi.fn(async (f: unknown[]) => {
      calls.many++;
      // как настоящий: не-фото -> unsupported
      if (f.some((x) => (x as { buf: Buffer }).buf[0] !== 0xff)) throw new real.ParseError("unsupported", "Несколько файлов можно только фото");
      return result("images", f.length);
    }),
  };
});

const { POST } = await import("./route");

const img = (n: number) => new File([new Uint8Array([0xff, 0xd8, 0xff, n])], `${n}.jpg`, { type: "image/jpeg" });
let ip = 0;
const send = (files: File[], url = "http://x/api/parse?stream=0") => {
  const f = new FormData();
  for (const x of files) f.append("file", x);
  return POST(new Request(url, { method: "POST", body: f, headers: { "x-forwarded-for": `10.9.0.${++ip}` } }));
};

describe("multi-file /api/parse", () => {
  it("rejects 7 files", async () => {
    const r = await send(Array.from({ length: 7 }, (_, i) => img(i)));
    expect(r.status).toBe(413);
  });

  it("rejects doc mixed with image (415)", async () => {
    const r = await send([img(1), new File(["%PDF-1.4"], "a.pdf")]);
    expect(r.status).toBe(415);
    expect((await r.json()).error.message).toBe("Несколько файлов можно только фото");
  });

  it("accepts 2 images in JSON mode", async () => {
    const r = await send([img(1), img(2)]);
    expect(r.status).toBe(200);
    expect((await r.json()).meta).toMatchObject({ format: "images", pages: 2 });
  });

  it("accepts 2 images in stream mode; single file uses single path", async () => {
    const r = await send([img(1), img(2)], "http://x/api/parse");
    expect(r.headers.get("content-type")).toContain("ndjson");
    expect(await r.text()).toContain('"pages":2');
    const before = calls.one;
    await send([img(3)]);
    expect(calls.one).toBe(before + 1);
  });
});
