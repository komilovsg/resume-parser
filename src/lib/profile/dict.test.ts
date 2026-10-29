import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDict, resetDictCache } from "./dict";
import { fixture } from "./fixture.test-dict";

const ENV = ["PROFILE_DICT_URL", "PROFILE_DICT_TOKEN", "BLOB_READ_WRITE_TOKEN"];
const file = (data: unknown) => {
  const p = join(mkdtempSync(join(tmpdir(), "dict-")), "d.json");
  writeFileSync(p, JSON.stringify(data));
  return p;
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetDictCache();
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadDict", () => {
  it("unset env -> null", async () => expect(await loadDict()).toBeNull());

  it("reads a local file", async () => {
    process.env.PROFILE_DICT_URL = file(fixture);
    expect((await loadDict())?.skills.length).toBe(fixture.skills.length);
  });

  it("bad shape -> null, no secrets in logs", async () => {
    process.env.PROFILE_DICT_URL = file({ skills: [{ id: "x", name: 1 }] });
    expect(await loadDict()).toBeNull();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(process.env.PROFILE_DICT_URL);
  });

  it("missing file -> null", async () => {
    process.env.PROFILE_DICT_URL = "/nonexistent/dict.json";
    expect(await loadDict()).toBeNull();
  });

  it("http sends Bearer token", async () => {
    process.env.PROFILE_DICT_URL = "https://example.test/d.json";
    process.env.PROFILE_DICT_TOKEN = "tok";
    const f = vi.fn(async () => Response.json(fixture));
    vi.stubGlobal("fetch", f);
    expect(await loadDict()).not.toBeNull();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: "Bearer tok" });
    await loadDict();
    expect(f).toHaveBeenCalledTimes(1); // кэш
  });

  it("falls back to BLOB_READ_WRITE_TOKEN", async () => {
    process.env.PROFILE_DICT_URL = "https://example.test/d.json";
    process.env.BLOB_READ_WRITE_TOKEN = "blob";
    const f = vi.fn(async () => Response.json(fixture));
    vi.stubGlobal("fetch", f);
    await loadDict();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: "Bearer blob" });
  });

  it("PROFILE_DICT_TOKEN wins over BLOB_READ_WRITE_TOKEN", async () => {
    process.env.PROFILE_DICT_URL = "https://example.test/d.json";
    process.env.PROFILE_DICT_TOKEN = "own";
    process.env.BLOB_READ_WRITE_TOKEN = "blob";
    const f = vi.fn(async () => Response.json(fixture));
    vi.stubGlobal("fetch", f);
    await loadDict();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: "Bearer own" });
  });

  it("http error -> null, failure cached", async () => {
    process.env.PROFILE_DICT_URL = "https://example.test/d.json";
    const f = vi.fn(async () => new Response("no", { status: 403 }));
    vi.stubGlobal("fetch", f);
    expect(await loadDict()).toBeNull();
    expect(await loadDict()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
