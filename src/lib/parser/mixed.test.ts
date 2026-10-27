import JSZip from "jszip";
import { deflateSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectAndExtract, isMixedPdf } from "./extract";
import { imageInfo, pickContentImages } from "./images";
import type { Resume } from "./schema";

const sent: { contents: unknown; config: { systemInstruction: string } }[] = [];
let answer: Resume;

vi.mock("@google/genai", async (orig) => ({
  ...(await orig<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = {
      generateContent: async (req: { contents: unknown; config: { systemInstruction: string } }) => {
        sent.push(req);
        return { text: JSON.stringify(answer) };
      },
    };
  },
}));

const { structureResume } = await import("./structure");
const { verifyResume } = await import("./verify");

// ---------- фикстуры, собираемые в тесте ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
// RGB-PNG с детерминированным «шумом», чтобы размер был заметным
function png(w: number, h: number, noise = true): Buffer {
  const row = 1 + w * 3;
  const raw = Buffer.alloc(row * h);
  let seed = 12345;
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < row; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      raw[y * row + x] = noise ? seed >> 16 : 200;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const TEXT = "Алишер Каримов\nBackend разработчик. Опыт работы: ООО Ромашка, должность разработчик, с 2019 по 2023 год.";

async function docx(media: Record<string, Buffer>, used: string[]): Promise<Buffer> {
  const z = new JSZip();
  z.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const rels = Object.keys(media).map((n, i) => `<Relationship Id="rIdImg${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${n}"/>`);
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
  for (const [n, b] of Object.entries(media)) z.file(`word/media/${n}`, b);
  const pics = Object.keys(media)
    .map((n, i) => (used.includes(n) ? `<w:p><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rIdImg${i}"/></w:drawing></w:r></w:p>` : ""))
    .join("");
  const paras = TEXT.split("\n").map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("");
  z.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paras}${pics}</w:body></w:document>`);
  return z.generateAsync({ type: "nodebuffer" });
}

// Минимальный PDF: страница 1 — текст, страница 2 — картинка (cover = доля страницы по ширине/высоте)
function pdf(page2: "image" | "logo" | "text"): Buffer {
  const long = Array.from({ length: 8 }, () => "Resume text line about experience and skills.").join(") Tj T* (");
  const objs: string[] = [];
  const stream = (dict: string, body: string) => `<< ${dict} /Length ${body.length} >>\nstream\n${body}\nendstream`;
  const c1 = `BT /F1 10 Tf 12 TL 20 700 Td (${long}) Tj ET`;
  const c2 =
    page2 === "text"
      ? `BT /F1 10 Tf 12 TL 20 700 Td (${long}) Tj ET`
      : `q ${page2 === "image" ? "500 0 0 700 50 50" : "40 0 0 40 50 50"} cm /Im0 Do Q`;
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>";
  objs[4] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> /XObject << /Im0 8 0 R >> >> >>";
  objs[5] = stream("", c1);
  objs[6] = stream("", c2);
  objs[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[8] = stream("/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode", "FF0000 00FF00 0000FF FFFFFF>");
  let out = "%PDF-1.4\n";
  const off: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    off[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${off.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("images: заголовки и отбор", () => {
  it("png/jpeg размеры", () => {
    expect(imageInfo(png(320, 310, false))).toMatchObject({ mimeType: "image/png", w: 320, h: 310 });
    const jpg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffc0001108012c019003011100021101031101ffd9", "hex");
    expect(imageInfo(jpg)).toMatchObject({ mimeType: "image/jpeg", w: 400, h: 300 });
    expect(imageInfo(Buffer.from("<svg/>"))).toBeNull();
  });
  it("лимит 6 штук: остаются крупнейшие + предупреждение", () => {
    const imgs = Array.from({ length: 8 }, (_, i) => png(300 + i * 4, 300 + i * 4));
    const r = pickContentImages(imgs);
    expect(r.parts).toHaveLength(6);
    expect(r.warnings).toHaveLength(1);
    const kept = new Set(r.parts.map((p) => p.data.length));
    const biggest = [...imgs].sort((a, b) => b.length - a.length).slice(0, 6);
    expect(biggest.every((b) => kept.has(b.length))).toBe(true);
  });
});

describe("DOCX: детекция картинок", () => {
  it("текст + картинка 320x320 -> mixed", async () => {
    const big = png(320, 320);
    expect(big.length).toBeGreaterThan(15 * 1024);
    const r = await detectAndExtract(await docx({ "image1.png": big }, ["image1.png"]), "x.docx");
    expect(r.kind).toBe("mixed");
    if (r.kind !== "mixed") return;
    expect(r.text).toContain("Алишер Каримов");
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].mimeType).toBe("image/png");
  });
  it("только логотип 32x32 -> text", async () => {
    const r = await detectAndExtract(await docx({ "logo.png": png(32, 32) }, ["logo.png"]), "x.docx");
    expect(r.kind).toBe("text");
  });
  it("большая картинка без ссылки из document.xml -> text", async () => {
    const r = await detectAndExtract(await docx({ "image1.png": png(320, 320) }, []), "x.docx");
    expect(r.kind).toBe("text");
  });
  it("картинка 600x200 (одна сторона < 300) -> text", async () => {
    const r = await detectAndExtract(await docx({ "wide.png": png(600, 200) }, ["wide.png"]), "x.docx");
    expect(r.kind).toBe("text");
  });
  it("существующая фикстура resume.docx остаётся text", async () => {
    const { readFileSync } = await import("node:fs");
    const r = await detectAndExtract(readFileSync(`${__dirname}/../../../fixtures/resume.docx`), "resume.docx");
    expect(r.kind).toBe("text");
  });
});

describe("PDF: смешанный", () => {
  it("классификация страниц", () => {
    expect(isMixedPdf([{ chars: 900, images: 0, maxCover: 0 }])).toBe(false);
    expect(isMixedPdf([{ chars: 900, images: 0, maxCover: 0 }, { chars: 10, images: 1, maxCover: 0.4 }])).toBe(true);
    expect(isMixedPdf([{ chars: 900, images: 1, maxCover: 0.35 }])).toBe(true);
    expect(isMixedPdf([{ chars: 900, images: 1, maxCover: 0.05 }, { chars: 20, images: 1, maxCover: 0.001 }])).toBe(false);
  });
  it("страница текста + страница-картинка -> mixed с исходным PDF", async () => {
    const buf = pdf("image");
    const r = await detectAndExtract(buf, "x.pdf");
    expect(r.kind).toBe("mixed");
    if (r.kind !== "mixed") return;
    expect(r.parts[0].mimeType).toBe("application/pdf");
    expect(r.parts[0].data).toBe(buf);
    expect(r.text).toContain("Resume text line");
  });
  it("две страницы текста -> text; крошечный логотип -> text", async () => {
    expect((await detectAndExtract(pdf("text"), "x.pdf")).kind).toBe("text");
    expect((await detectAndExtract(pdf("logo"), "x.pdf")).kind).toBe("text");
  });
});

const empty: Resume = {
  fullName: "Алишер Каримов", desiredPosition: null,
  contacts: { email: null, phone: null, city: null, links: [] },
  summary: null, salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
};

describe("Gemini: запрос для mixed", () => {
  beforeEach(() => {
    sent.length = 0;
    process.env.AI_API_KEY = "test";
    process.env.GEMINI_MODELS = "a";
    delete process.env.AI_PROVIDER;
    answer = empty;
  });
  it("текст + inline-картинка в одном запросе, системный промпт про оба источника", async () => {
    const data = png(310, 310);
    const r = await structureResume({ kind: "mixed", text: "резюме текст", parts: [{ mimeType: "image/png", data }], format: "docx" });
    expect(r.imagesUsed).toBe(true);
    const parts = sent[0].contents as { text?: string; inlineData?: { mimeType: string; data: string } }[];
    expect(parts[0].text).toContain("резюме текст");
    expect(parts.some((p) => p.inlineData?.mimeType === "image/png" && p.inlineData.data === data.toString("base64"))).toBe(true);
    expect(sent[0].config.systemInstruction).toContain("BOTH");
  });
  it("openai: PNG уходит как image_url, PDF -> только текст + предупреждение", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODELS = "m1";
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(empty) } }] })));
    vi.stubGlobal("fetch", f);
    const img = await structureResume({ kind: "mixed", text: "t", parts: [{ mimeType: "image/png", data: png(300, 300) }], format: "docx" });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(JSON.stringify(body.messages[1].content)).toContain("data:image/png;base64,");
    expect(img.warnings).toEqual([]);
    const pdfRes = await structureResume({ kind: "mixed", text: "t", parts: [{ mimeType: "application/pdf", data: Buffer.from("%PDF") }], format: "pdf" });
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODELS;
    expect(pdfRes.warnings).toContain("Изображения в документе не обработаны этим ИИ-провайдером");
    expect(pdfRes.imagesUsed).toBe(false);
  });
});

describe("verifyResume: mixed", () => {
  const r: Resume = {
    ...empty,
    contacts: { email: "photo@scan.tj", phone: null, city: null, links: [] },
    experience: [{ company: "ООО Ромашка", position: "разработчик", city: null, startDate: "2019-01", endDate: "2023-01", current: false, description: null }],
    education: [{ institution: "Таджикский технический университет", degree: null, field: null, startYear: 2010, endYear: 2015 }],
    skills: ["Python"],
  };
  const text = `Алишер Каримов\nПочта: real@mail.tj\nООО Ромашка разработчик 2019 2023`;

  it("mixed: не найденное в тексте остаётся и попадает в unverified", () => {
    const v = verifyResume(r, text, true);
    expect(v.resume.education).toHaveLength(1);
    expect(v.resume.education[0].institution).toBe("Таджикский технический университет");
    expect(v.resume.contacts.email).toBe("photo@scan.tj");
    expect(v.resume.skills).toEqual(["Python"]);
    expect(v.unverified).toContain("Образование: Таджикский технический университет");
    expect(v.unverified).toContain("Email: photo@scan.tj");
    expect(v.unverified).not.toContain("Имя: Алишер Каримов");
    expect(v.warnings).toContain("В документе есть изображения: часть данных распознана с них — проверьте");
  });
  it("mixed: пустые контакты дозаполняются из текста", () => {
    const v = verifyResume({ ...r, contacts: { ...r.contacts, email: null } }, text, true);
    expect(v.resume.contacts.email).toBe("real@mail.tj");
  });
  it("text: удаляет, unverified пуст", () => {
    const v = verifyResume(r, text);
    expect(v.resume.education).toHaveLength(0);
    expect(v.resume.contacts.email).toBe("real@mail.tj");
    expect(v.resume.skills).toEqual([]);
    expect(v.unverified).toEqual([]);
  });
  it("file: без сверки", () => {
    const v = verifyResume(r, null);
    expect(v.grounded).toBe(false);
    expect(v.resume).toBe(r);
  });
});
