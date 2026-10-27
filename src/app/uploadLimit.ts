// Тексты ошибок про размер. hostMb — лимит хостинга (Vercel ~4,5 МБ), пусто — свой Docker-сервис
export const APP_LIMIT = 10 * 1024 * 1024;
export const hostLimitMb = Number(process.env.NEXT_PUBLIC_HOST_LIMIT_MB) || 0;

const mb = (n: number) => String(n).replace(".", ",");

export function hostMessage(hostMb: number, photos: boolean): string {
  return `${photos ? "Фото вместе весят" : "Файл"} больше ${mb(hostMb)} МБ. Это ограничение хостинга Vercel, на котором работает демо. В установленном сервисе лимит — 10 МБ. Попробуйте сжать PDF или загрузить фото — их мы сжимаем автоматически.`;
}

// Ошибка размера до отправки (после сжатия); null — можно слать
export function sizeError(total: number, hostMb: number, photos: boolean): string | null {
  if (hostMb && total > hostMb * 1024 * 1024) return hostMessage(hostMb, photos);
  if (total > APP_LIMIT) return "Файл больше 10 МБ — это предел сервиса.";
  return null;
}

// Любой 413 (наш JSON или чужой текст Vercel): при заданном лимите хостинга — его сообщение
export function statusMessage(status: number, hostMb: number, photos: boolean, serverMsg?: string): string | null {
  if (status !== 413) return null;
  return hostMb ? hostMessage(hostMb, photos) : serverMsg || "Файл больше 10 МБ — это предел сервиса.";
}
