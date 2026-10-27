import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParseError } from "./errors";
import { cooling, extractJson, structureResume, thinking } from "./structure";
import { resetPlainJson } from "./providers";

const empty = {
  fullName: "Тест", desiredPosition: null,
  contacts: { email: null, phone: null, city: null, links: [] },
  summary: null, salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
};
const input = { kind: "text", text: "резюме", format: "txt" } as const;
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

let calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
let handler: (n: number) => Response = () => reply(JSON.stringify(empty));

beforeEach(() => {
  calls = [];
  cooling.clear();
  thinking.clear();
  resetPlainJson();
  for (const k of ["AI_PROVIDER", "AI_MODELS", "AI_BASE_URL", "AI_API_KEY", "GEMINI_API_KEY", "GEMINI_MODELS", "AI_VISION"]) delete process.env[k];
  handler = () => reply(JSON.stringify(empty));
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return handler(calls.length);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("local provider", () => {
  it("sends no Authorization without a key and uses the default base url", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_MODELS = "qwen2.5:7b-instruct";
    expect((await structureResume(input)).model).toBe("qwen2.5:7b-instruct");
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it("sends Authorization when a key is set", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_MODELS = "m";
    process.env.AI_API_KEY = "k";
    await structureResume(input);
    expect(calls[0].headers.Authorization).toBe("Bearer k");
  });

  it("requires AI_MODELS", async () => {
    process.env.AI_PROVIDER = "local";
    await expect(structureResume(input)).rejects.toThrow("Укажите AI_MODELS для локальной модели");
    await expect(structureResume(input)).rejects.toBeInstanceOf(ParseError);
    expect(calls).toHaveLength(0);
  });

  it("parses fenced JSON", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_MODELS = "m";
    handler = () => reply("Вот резюме:\n```json\n" + JSON.stringify(empty) + "\n```");
    expect((await structureResume(input)).resume.fullName).toBe("Тест");
  });

  it("retries once on invalid JSON", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_MODELS = "m";
    handler = (n) => reply(n === 1 ? "не json" : JSON.stringify(empty));
    await structureResume(input);
    expect(calls).toHaveLength(2);
  });

  it("falls back to plain prompt when response_format is rejected", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_MODELS = "m";
    handler = (n) => (n === 1 ? new Response("response_format not supported", { status: 400 }) : reply(JSON.stringify(empty)));
    await structureResume(input);
    expect(calls[0].body.response_format).toBeDefined();
    expect(calls[1].body.response_format).toBeUndefined();
    await structureResume(input); // запоминает модель
    expect(calls[2].body.response_format).toBeUndefined();
  });

  it("rejects images for local without AI_VISION=1", async () => {
    process.env.AI_PROVIDER = "local";
    process.env.AI_MODELS = "m";
    const img = { kind: "file", mimeType: "image/png", data: Buffer.from("x"), format: "png" } as never;
    await expect(structureResume(img)).rejects.toBeInstanceOf(ParseError);
  });
});

describe("openai provider", () => {
  it("defaults to gpt-4o-mini and requires a key", async () => {
    process.env.AI_PROVIDER = "openai";
    await expect(structureResume(input)).rejects.toThrow("Сервис ИИ не настроен");
    process.env.AI_API_KEY = "k";
    expect((await structureResume(input)).model).toBe("gpt-4o-mini");
  });
});

describe("extractJson", () => {
  it("handles text around braces", () => expect(extractJson('ok {"a":1} bye')).toEqual({ a: 1 }));
});
