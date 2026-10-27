import { describe, expect, it } from "vitest";
import { hostMessage, sizeError, statusMessage } from "./uploadLimit";

const MB = 1024 * 1024;

describe("upload limit messages", () => {
  it("any 413 on Vercel -> host message, even with non-JSON body", () => {
    expect(statusMessage(413, 4.5, false)).toBe(hostMessage(4.5, false));
    expect(statusMessage(413, 4.5, true)).toContain("Фото вместе весят больше 4,5 МБ");
  });
  it("413 elsewhere -> our message", () => {
    expect(statusMessage(413, 0, false, "Файл больше 10 МБ")).toBe("Файл больше 10 МБ");
    expect(statusMessage(413, 0, false)).toBe("Файл больше 10 МБ — это предел сервиса.");
  });
  it("other statuses are not mapped", () => {
    expect(statusMessage(500, 4.5, false)).toBeNull();
  });
  it("client-side size check", () => {
    expect(sizeError(5 * MB, 4.5, false)).toContain("4,5 МБ");
    expect(sizeError(5 * MB, 0, false)).toBeNull();
    expect(sizeError(11 * MB, 0, false)).toBe("Файл больше 10 МБ — это предел сервиса.");
    expect(sizeError(11 * MB, 4.5, false)).toContain("Vercel");
    expect(sizeError(4 * MB, 4.5, false)).toBeNull();
  });
});
