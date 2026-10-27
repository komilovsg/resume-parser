import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resume } from "./schema";

const sent: { contents: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[] = [];

vi.mock("@google/genai", async (orig) => ({
  ...(await orig<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = {
      generateContent: async (req: (typeof sent)[number]) => {
        sent.push(req);
        return { text: JSON.stringify(empty) };
      },
    };
  },
}));

const { parseResumeImages } = await import("./index");

const empty: Resume = {
  fullName: "Алишер Каримов", desiredPosition: null,
  contacts: { email: null, phone: null, city: null, links: [] },
  summary: null, salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
};
const jpg = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from([n, n, n])]);

describe("parseResumeImages", () => {
  beforeEach(() => {
    sent.length = 0;
    process.env.AI_API_KEY = "test";
    process.env.GEMINI_MODELS = "a";
    delete process.env.AI_PROVIDER;
  });

  it("Gemini gets N inline images in order with a pages note; meta.pages, ungrounded", async () => {
    const files = [1, 2, 3].map((n) => ({ buf: jpg(n), filename: `${n}.jpg` }));
    const r = await parseResumeImages(files);
    const c = sent[0].contents;
    expect(c[0].text).toBe("Страницы резюме по порядку: 3 фото");
    const imgs = c.filter((p) => p.inlineData);
    expect(imgs.map((p) => p.inlineData!.data)).toEqual(files.map((f) => f.buf.toString("base64")));
    expect(imgs.every((p) => p.inlineData!.mimeType === "image/jpeg")).toBe(true);
    expect(r.meta).toMatchObject({ format: "images", pages: 3, grounded: false });
  });

  it("rejects non-image among several", async () => {
    await expect(parseResumeImages([{ buf: jpg(1), filename: "a.jpg" }, { buf: Buffer.from("%PDF-1.4 x"), filename: "a.pdf" }])).rejects.toMatchObject({ code: "unsupported" });
  });

  it("openai without vision -> unsupported", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_VISION = "0";
    await expect(parseResumeImages([{ buf: jpg(1), filename: "a" }, { buf: jpg(2), filename: "b" }])).rejects.toMatchObject({ code: "unsupported" });
    delete process.env.AI_VISION;
  });
});
