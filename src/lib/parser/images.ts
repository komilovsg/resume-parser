import type JSZip from "jszip";

export type ImagePart = { mimeType: string; data: Buffer };

const MIN_BYTES = 15 * 1024;
const MIN_SIDE = 300;
export const MAX_IMAGES = 6;
export const MAX_IMAGES_TOTAL = 8 * 1024 * 1024;

// Размеры из заголовков PNG/JPEG без зависимостей; null — не удалось прочитать
export function imageInfo(b: Buffer): { mimeType: string; w: number | null; h: number | null } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("latin1", 12, 16) === "IHDR") {
    return { mimeType: "image/png", w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = b.readUInt16BE(i + 2);
      // SOF0..SOF15 кроме DHT(c4), JPG(c8), DAC(cc)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mimeType: "image/jpeg", h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { mimeType: "image/jpeg", w: null, h: null };
  }
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", w: null, h: null };
  }
  return null; // EMF/WMF/SVG/GIF/прочее — пропускаем
}

// Оставляет «содержательные» картинки: ≥15 КБ и (если размеры известны) обе стороны ≥300 px.
// Лимиты: не более 6 штук и 8 МБ суммарно — остаются самые крупные, порядок документа сохраняется.
export function pickContentImages(raw: Buffer[]): { parts: ImagePart[]; warnings: string[] } {
  const ok: ImagePart[] = [];
  for (const data of raw) {
    if (data.length < MIN_BYTES) continue;
    const info = imageInfo(data);
    if (!info) continue;
    if (info.w !== null && info.h !== null && (info.w < MIN_SIDE || info.h < MIN_SIDE)) continue;
    ok.push({ mimeType: info.mimeType, data });
  }
  const bySize = [...ok].sort((a, b) => b.data.length - a.data.length);
  const keep = new Set<ImagePart>();
  let total = 0;
  for (const p of bySize) {
    if (keep.size >= MAX_IMAGES || total + p.data.length > MAX_IMAGES_TOTAL) continue;
    keep.add(p);
    total += p.data.length;
  }
  const warnings = keep.size < ok.length ? [`В документе слишком много изображений: обработаны ${keep.size} из ${ok.length}`] : [];
  return { parts: ok.filter((p) => keep.has(p)), warnings };
}

const attrs = (xml: string, re: RegExp) => [...xml.matchAll(re)].map((m) => m[1]);

function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const out = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
}

async function load(zip: JSZip, paths: string[]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const p of [...new Set(paths)]) {
    const f = zip.file(p);
    if (f) out.push(await f.async("nodebuffer"));
  }
  return out;
}

// DOCX: только картинки, на которые реально ссылается document.xml (r:embed / r:id → rels → word/media/*)
export async function docxImages(zip: JSZip, docXml: string): Promise<Buffer[]> {
  const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const used = new Set([...attrs(docXml, /\br:embed="([^"]+)"/g), ...attrs(docXml, /<v:imagedata\b[^>]*\br:id="([^"]+)"/g)]);
  const paths: string[] = [];
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (!id || !target || !used.has(id) || /TargetMode="External"/.test(m[0])) continue;
    const p = resolve("word/document.xml", target);
    if (p.startsWith("word/media/")) paths.push(p);
  }
  return load(zip, paths);
}

// ODT: Pictures/* из xlink:href в content.xml
export async function odtImages(zip: JSZip, contentXml: string): Promise<Buffer[]> {
  const paths = attrs(contentXml, /<draw:image\b[^>]*\bxlink:href="([^"]+)"/g)
    .map((h) => h.replace(/^\.\//, ""))
    .filter((h) => h.startsWith("Pictures/"));
  return load(zip, paths);
}
