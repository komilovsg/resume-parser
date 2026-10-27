import { ApiError } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Resume } from "./schema";

const calls: string[] = [];
const levels: string[] = [];
let behavior: Record<string, () => unknown> = {};

vi.mock("@google/genai", async (orig) => ({
  ...(await orig<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model, config }: { model: string; config: { thinkingConfig: { thinkingLevel: string } } }) => {
        calls.push(model);
        levels.push(config.thinkingConfig.thinkingLevel);
        return behavior[model]();
      },
    };
  },
}));

const { structureResume, cooling, thinking, DEFAULT_MODELS } = await import("./structure");

const empty: Resume = {
  fullName: "Тест", desiredPosition: null,
  contacts: { email: null, phone: null, city: null, links: [] },
  summary: null, salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
};
const ok = () => ({ text: JSON.stringify(empty) });
const err = (status: number) => () => {
  throw new ApiError({ message: "x", status });
};
const input = { kind: "text", text: "резюме", format: "txt" } as const;

beforeEach(() => {
  calls.length = 0;
  levels.length = 0;
  cooling.clear();
  thinking.clear();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_MODELS;
  delete process.env.AI_BASE_URL;
  process.env.AI_API_KEY = "test";
  process.env.GEMINI_MODELS = "a,b,c";
});

describe("structureResume chain", () => {
  it("503 на первой -> ответ второй, первая в cooldown", async () => {
    behavior = { a: err(503), b: ok, c: ok };
    expect((await structureResume(input)).model).toBe("b");
    calls.length = 0;
    expect((await structureResume(input)).model).toBe("b");
    expect(calls).toEqual(["b"]);
  });

  it("404 и 429 -> третья", async () => {
    behavior = { a: err(404), b: err(429), c: ok };
    expect((await structureResume(input)).model).toBe("c");
  });

  it("невалидный JSON: один повтор на той же модели, затем следующая", async () => {
    behavior = { a: () => ({ text: "{bad" }), b: ok, c: ok };
    expect((await structureResume(input)).model).toBe("b");
    expect(calls).toEqual(["a", "a", "b"]);
  });

  it("все упали -> llm_failed", async () => {
    behavior = { a: err(503), b: err(503), c: err(500) };
    await expect(structureResume(input)).rejects.toMatchObject({ code: "llm_failed" });
  });

  it("порядок моделей по умолчанию", () => {
    expect(DEFAULT_MODELS.split(",").slice(0, 3)).toEqual(["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-flash-lite"]);
    expect(DEFAULT_MODELS.split(",")).toHaveLength(8);
  });

  it("400 про thinking: повтор с LOW на той же модели и запоминание", async () => {
    let n = 0;
    behavior = {
      a: () => {
        if (n++ === 0) throw new ApiError({ message: "Thinking level MINIMAL is not supported", status: 400 });
        return ok();
      },
    };
    expect((await structureResume(input)).model).toBe("a");
    expect(calls).toEqual(["a", "a"]);
    expect(levels).toEqual(["MINIMAL", "LOW"]);
    levels.length = 0;
    await structureResume(input);
    expect(levels).toEqual(["LOW"]);
  });

  it("stages: ai -> retry -> ai", async () => {
    behavior = { a: err(429), b: ok };
    const st: string[] = [];
    await structureResume(input, (s) => st.push(s.stage === "retry" ? `retry:${s.reason}` : s.stage));
    expect(st).toEqual(["ai", "retry:quota", "ai"]);
  });

  it("openai провайдер: fetch chat/completions", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_BASE_URL = "https://x.test/v1/";
    process.env.AI_MODELS = "m1";
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(empty) } }] })));
    vi.stubGlobal("fetch", f);
    const r = await structureResume(input);
    vi.unstubAllGlobals();
    expect(r.model).toBe("m1");
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://x.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("JSON Schema");
  });

  it("openai + PDF-скан -> unsupported", async () => {
    process.env.AI_PROVIDER = "openai";
    await expect(
      structureResume({ kind: "file", mimeType: "application/pdf", data: Buffer.from("x"), format: "pdf" }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
});
