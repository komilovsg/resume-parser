import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ParseError } from "./errors";
import { detectAndExtract } from "./extract";

const dir = join(__dirname, "../../../fixtures");
const expected: Record<string, string> = {
  "resume.html": "html",
  "resume.docx": "docx",
  "resume.doc": "doc",
  "resume.rtf": "rtf",
  "resume.odt": "odt",
  "resume.txt": "txt",
  "resume-1251.txt": "txt",
  "resume.pdf": "pdf",
};

describe("detectAndExtract", () => {
  for (const name of readdirSync(dir).filter((n) => n in expected)) {
    it(`${name} -> ${expected[name]}`, async () => {
      const r = await detectAndExtract(readFileSync(join(dir, name)), name);
      expect(r.format).toBe(expected[name]);
      if (r.kind === "text") expect(r.text).toContain("Алишер Каримов");
      else if (r.kind === "file") expect(r.data.subarray(0, 4).toString()).toBe("%PDF");
    });
  }

  for (const name of ["resume.pdf", "resume.docx"]) {
    it(`${name}: перенос строки между строками сохраняется`, async () => {
      const r = await detectAndExtract(readFileSync(join(dir, name)), name);
      expect(r.kind === "text" && r.text).toMatch(/Город: Душанбе\s*\n\s*Телефон:/);
      expect(r.kind === "text" && r.text).not.toContain("ДушанбеТелефон");
    });
  }

  it("все фикстуры найдены", () => {
    expect(readdirSync(dir).filter((n) => n in expected).sort()).toEqual(Object.keys(expected).sort());
  });

  it("случайные байты под видом pdf -> unsupported", async () => {
    const buf = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 37 + 11) % 256));
    await expect(detectAndExtract(buf, "x.pdf")).rejects.toMatchObject({ code: "unsupported" });
    expect(ParseError).toBeDefined();
  });
});
