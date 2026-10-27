// Сжатие фото на клиенте: телефонные снимки 3–8 МБ не проходят лимит тела запроса (~4,5 МБ на Vercel)
const MAX_SIDE = 2000;
const QUALITY = 0.85;

export const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

async function encode(bmp: ImageBitmap, w: number, h: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
    try {
      return await c.convertToBlob({ type: "image/jpeg", quality: QUALITY });
    } catch {}
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, "image/jpeg", QUALITY));
}

// Не изображение, не декодируется (напр. HEIC вне Safari) или стало больше — вернётся исходный файл
export async function compressImage(f: File): Promise<File> {
  if (!isImage(f)) return f;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const blob = await encode(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k));
    bmp.close();
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}
