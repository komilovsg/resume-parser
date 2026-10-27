import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import WordExtractor from "word-extractor";
import { ParseError } from "./errors";
import { docxImages, odtImages, pickContentImages, type ImagePart } from "./images";

export type Extracted =
  | { kind: "text"; text: string; format: string }
  | { kind: "file"; mimeType: string; data: Buffer; format: string }
  // несколько фото — страницы одного резюме по порядку
  | { kind: "images"; parts: ImagePart[]; format: string }
  // текст + картинки/PDF, в которых тоже может быть содержимое резюме
  | { kind: "mixed"; text: string; parts: ImagePart[]; format: string; warnings?: string[] };

const MAX_UNPACKED = 50 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MIN_OFFICE_TEXT = 50;
const MIN_PDF_TEXT = 200;
const MIN_PAGE_TEXT = 80; // меньше — страница «почти без текста»
const BIG_IMAGE_COVER = 0.3; // картинка на ≥30% страницы
const MIN_IMAGE_COVER = 0.03; // мельче (логотип, значок) на «пустой» странице не считаем
const MAX_PDF_PAGES = 30;

export type PdfPageInfo = { chars: number; images: number; maxCover: number };

// «Смешанный» PDF: текстовый слой есть, но часть содержимого может быть картинкой
export function isMixedPdf(pages: PdfPageInfo[]): boolean {
  return pages.some(
    (p) => p.maxCover >= BIG_IMAGE_COVER || (p.chars < MIN_PAGE_TEXT && p.images > 0 && p.maxCover >= MIN_IMAGE_COVER),
  );
}

// Операторы страницы: считаем нарисованные картинки и долю площади, занятую самой большой (по CTM)
async function pdfPageImages(page: Awaited<ReturnType<Awaited<ReturnType<typeof getDocumentProxy>>["getPage"]>>): Promise<{ images: number; maxCover: number }> {
  const { OPS } = await getResolvedPDFJS();
  const paint = new Set<number>(
    [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, (OPS as Record<string, number>).paintJpegXObject].filter(
      (x): x is number => typeof x === "number",
    ),
  );
  const [x0, y0, x1, y1] = page.view;
  const area = Math.abs((x1 - x0) * (y1 - y0)) || 1;
  const { fnArray, argsArray } = await page.getOperatorList();
  type M = [number, number, number, number, number, number];
  const mul = (m: M, n: M): M => [
    n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
  ];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let images = 0;
  let maxCover = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, argsArray[i] as M);
    else if (paint.has(fn)) {
      images++;
      maxCover = Math.max(maxCover, Math.min(1, Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / area));
    }
  }
  return { images, maxCover };
}

const startsWith = (b: Buffer, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

function normalize(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return named[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html: string): string {
  const t = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|section|ul|ol|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(t);
}

// Защита от zip-бомб: суммируем распакованный размер по central directory, ничего не распаковывая
async function openZip(buf: Buffer): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new ParseError("unsupported", "Файл повреждён или не является поддерживаемым архивом");
  }
  const files = Object.values(zip.files) as unknown as { _data?: { uncompressedSize?: number } }[];
  const total = files.reduce((sum, f) => sum + (f._data?.uncompressedSize ?? 0), 0);
  if (files.length > MAX_ENTRIES || total > MAX_UNPACKED) {
    throw new ParseError("zip_bomb", "Файл слишком большой после распаковки");
  }
  return zip;
}

// ponytail: таблицы схлопываются в строки, экзотические destination-группы отбрасываются.
// Однобайтовые кодовые страницы (ansicpg) — для CJK не годится.
function rtfToText(buf: Buffer): string {
  const s = buf.toString("latin1");
  let dec: TextDecoder;
  try {
    dec = new TextDecoder(`windows-${/\\ansicpg(\d+)/.exec(s)?.[1] ?? "1251"}`);
  } catch {
    dec = new TextDecoder("windows-1251");
  }
  const skipGroup = /^\\(?:\*|(?:fonttbl|colortbl|stylesheet|info|pict)(?![a-z]))/;
  const stack: number[] = [];
  let out = "";
  let depth = 0;
  let skip = 0;
  let uc = 1;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "{") {
      depth++;
      stack.push(uc);
      if (!skip && skipGroup.test(s.slice(i + 1, i + 20))) skip = depth;
      i++;
    } else if (c === "}") {
      if (skip === depth) skip = 0;
      depth--;
      uc = stack.pop() ?? 1;
      i++;
    } else if (c === "\\") {
      const d = s[i + 1];
      if (d === "'") {
        if (!skip) out += dec.decode(Uint8Array.of(parseInt(s.substr(i + 2, 2), 16) || 0));
        i += 4;
      } else if (/[a-z]/i.test(d)) {
        const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(s.slice(i, i + 40))!;
        i += m[0].length;
        const w = m[1];
        const n = m[2] === undefined ? undefined : parseInt(m[2], 10);
        if (w === "uc" && n !== undefined) uc = n;
        else if (w === "u" && n !== undefined) {
          if (!skip) out += String.fromCharCode(n < 0 ? n + 65536 : n);
          for (let k = 0; k < uc; k++) i += s[i] === "\\" && s[i + 1] === "'" ? 4 : 1;
        } else if (!skip && (w === "par" || w === "line" || w === "row")) out += "\n";
        else if (!skip && (w === "tab" || w === "cell")) out += "\t";
      } else {
        if (!skip) out += d === "~" ? " " : d === "\n" || d === "\r" ? "\n" : "\\{}".includes(d) ? d : "";
        i += 2;
      }
    } else {
      if (!skip && c !== "\n" && c !== "\r") out += c;
      i++;
    }
  }
  return out;
}

function decodeText(buf: Buffer): string {
  if (startsWith(buf, [0xff, 0xfe])) return new TextDecoder("utf-16le").decode(buf);
  if (startsWith(buf, [0xfe, 0xff])) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1251").decode(buf);
  }
}

function office(text: string, format: string, images?: Buffer[]): Extracted {
  const t = normalize(text);
  const picked = images?.length ? pickContentImages(images) : null;
  if (picked?.parts.length) {
    return { kind: "mixed", text: t, parts: picked.parts, format, ...(picked.warnings.length ? { warnings: picked.warnings } : {}) };
  }
  if (t.length < MIN_OFFICE_TEXT) throw new ParseError("empty", "В документе не найден текст");
  return { kind: "text", text: t, format };
}

// изображение по сигнатуре (PNG/JPEG/WebP/HEIC/HEIF), иначе null
export function sniffImage(buf: Buffer): { mimeType: string; format: string } | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { mimeType: "image/png", format: "png" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", format: "jpeg" };
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { mimeType: "image/webp", format: "webp" };
  if (buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis"].includes(brand)) return { mimeType: "image/heic", format: "heic" };
    if (["heif", "mif1", "msf1"].includes(brand)) return { mimeType: "image/heif", format: "heif" };
  }
  return null;
}

export async function detectAndExtract(buf: Buffer, filename: string): Promise<Extracted> {
  void filename; // тип определяется по сигнатуре, имя намеренно игнорируем
  if (buf.length === 0) throw new ParseError("empty", "Файл пустой");
  const file = (mimeType: string, format: string): Extracted => ({ kind: "file", mimeType, data: buf, format });

  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) {
    // текстовый слой быстрее и дешевле скана; иначе отдаём файл целиком
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: false });
      const t = normalize(text.join("\n\n"));
      if (t.length >= MIN_PDF_TEXT) {
        const pages: PdfPageInfo[] = [];
        for (let i = 0; i < Math.min(text.length, MAX_PDF_PAGES); i++) {
          const chars = normalize(text[i]).length;
          try {
            pages.push({ chars, ...(await pdfPageImages(await pdf.getPage(i + 1))) });
          } catch {
            // не смогли разобрать операторы: запасное правило — «пустая» страница считается смешанной
            pages.push(chars < MIN_PAGE_TEXT ? { chars, images: 1, maxCover: MIN_IMAGE_COVER } : { chars, images: 0, maxCover: 0 });
          }
        }
        if (isMixedPdf(pages)) return { kind: "mixed", text: t, parts: [{ mimeType: "application/pdf", data: buf }], format: "pdf" };
        return { kind: "text", text: t, format: "pdf" };
      }
    } catch {
      /* битый или зашифрованный — пусть решает ИИ */
    }
    return file("application/pdf", "pdf");
  }
  const img = sniffImage(buf);
  if (img) return file(img.mimeType, img.format);

  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    const zip = await openZip(buf);
    if (zip.file("word/document.xml")) {
      // mammoth в raw-режиме теряет <w:br/> (перенос строки внутри абзаца) — подменяем на текст "\n"
      const xml = (await zip.file("word/document.xml")!.async("string")).replace(/<w:br(?![^>]*w:type="(?:page|column)")[^>]*\/>/g, '<w:t xml:space="preserve">\n</w:t>');
      zip.file("word/document.xml", xml);
      const { value } = await mammoth.extractRawText({ buffer: await zip.generateAsync({ type: "nodebuffer" }) });
      return office(value, "docx", await docxImages(zip, xml));
    }
    const mt = await zip.file("mimetype")?.async("string");
    if (mt?.trim() === "application/vnd.oasis.opendocument.text") {
      const xml = (await zip.file("content.xml")?.async("string")) ?? "";
      const t = xml
        .replace(/<text:(tab|s)\s*\/>/g, " ")
        .replace(/<text:line-break\s*\/>|<\/text:(p|h)>/g, "\n")
        .replace(/<[^>]+>/g, "");
      return office(decodeEntities(t), "odt", await odtImages(zip, xml));
    }
    throw new ParseError("unsupported", "Этот формат файла не поддерживается");
  }

  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) {
    try {
      const doc = await new WordExtractor().extract(buf);
      return office(doc.getBody(), "doc");
    } catch (e) {
      if (e instanceof ParseError) throw e;
      throw new ParseError("unsupported", "Не удалось прочитать файл .doc");
    }
  }

  if (buf.toString("latin1", 0, 5) === "{\\rtf") return office(rtfToText(buf), "rtf");

  // Остальное — текст; бинарщину (NUL-байты) отсекаем
  if (buf.subarray(0, 4096).includes(0) && !startsWith(buf, [0xff, 0xfe]) && !startsWith(buf, [0xfe, 0xff])) {
    throw new ParseError("unsupported", "Этот формат файла не поддерживается");
  }
  const raw = decodeText(buf);
  const isHtml = /<\s*(!doctype|html|body|div|p|br|head)\b/i.test(raw.slice(0, 2000));
  const text = normalize(isHtml ? htmlToText(raw) : raw);
  if (!text) throw new ParseError("empty", "В документе не найден текст");
  return { kind: "text", text, format: isHtml ? "html" : "txt" };
}
