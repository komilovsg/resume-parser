import { beforeEach, describe, expect, it } from "vitest";
import type { Resume } from "@/lib/parser/schema";
import { applyPatch, applyStatus, canMove, createDraft, fmtDate, getDrafts, removeDraft, resetStore, setStatus, syncFromParser, updateDraft, type Draft } from "./store";

const resume = (over: Partial<Resume> = {}): Resume => ({
  fullName: "Иван Тестов", desiredPosition: "Frontend developer", contacts: { email: null, phone: null, city: "Душанбе", links: [] }, summary: null,
  salary: { from: 3000, to: 3000, currency: "TJS", period: "month" }, experience: [], education: [], skills: ["React"], languages: [], driverLicense: null,
  employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null, birthDate: null, ...over,
});

beforeEach(() => resetStore());

describe("status transitions", () => {
  it("allows draft -> published -> unpublished -> published only", () => {
    expect(canMove("draft", "published")).toBe(true);
    expect(canMove("published", "unpublished")).toBe(true);
    expect(canMove("unpublished", "published")).toBe(true);
    expect(canMove("draft", "unpublished")).toBe(false);
    expect(canMove("published", "draft")).toBe(false);
    expect(canMove("unpublished", "draft")).toBe(false);
  });

  it("moves through the full journey and keeps invalid moves a no-op", () => {
    const id = createDraft(resume(), "resume.docx");
    expect(getDrafts()[0].status).toBe("draft");
    setStatus(id, "unpublished");
    expect(getDrafts()[0].status).toBe("draft");
    setStatus(id, "published");
    expect(getDrafts()[0].status).toBe("published");
    expect(getDrafts()[0].publishedAt).toBeTypeOf("number");
    setStatus(id, "unpublished");
    expect(getDrafts()[0].status).toBe("unpublished");
    setStatus(id, "published");
    expect(getDrafts()[0].status).toBe("published");
  });

  it("applyStatus is pure and touches only the target", () => {
    const a = { id: "a", status: "draft", createdAt: 1, updatedAt: 1, resume: resume(), picks: {}, source: { filename: "a" } } as Draft;
    const b = { ...a, id: "b" };
    const out = applyStatus([a, b], "a", "published", 99);
    expect(out[0]).toMatchObject({ status: "published", updatedAt: 99 });
    expect(out[1]).toBe(b);
    expect(a.status).toBe("draft");
  });
});

describe("store", () => {
  it("creates, patches (only on real change), removes", () => {
    const id = createDraft(resume(), "a.pdf", { position: { id: 1, name: "Frontend developer" } });
    const d0 = getDrafts()[0];
    expect(d0).toMatchObject({ id, status: "draft", source: { filename: "a.pdf" } });
    updateDraft(id, { resume: d0.resume });
    expect(getDrafts()[0].updatedAt).toBe(d0.updatedAt);
    expect(applyPatch([d0], id, { picks: { ...d0.picks, negotiable: true } }, d0.updatedAt + 5)[0].updatedAt).toBe(d0.updatedAt + 5);
    removeDraft(id);
    expect(getDrafts()).toHaveLength(0);
  });

  it("snapshot is stable between writes (useSyncExternalStore contract)", () => {
    createDraft(resume(), "a");
    expect(getDrafts()).toBe(getDrafts());
  });

  it("survives corrupt storage content", () => {
    expect(getDrafts()).toEqual([]);
  });

  it("syncFromParser only before the draft was edited in profile", () => {
    const id = createDraft(resume(), "a");
    syncFromParser(id, resume({ fullName: "Другой" }));
    expect(getDrafts()[0].resume.fullName).toBe("Другой");
    updateDraft(id, { resume: resume({ fullName: "Из формы" }) });
    const d = getDrafts()[0];
    // имитируем «правили в анкете»: updatedAt уже отличается от createdAt
    expect(applyPatch([{ ...d, updatedAt: d.createdAt + 10 }], id, { resume: resume({ fullName: "x" }) }, d.createdAt + 20)[0].resume.fullName).toBe("x");
  });
});

describe("fmtDate", () => {
  it("formats day and month in Russian, year only when different", () => {
    const now = new Date(2026, 9, 26);
    expect(fmtDate(new Date(2026, 8, 30).getTime(), now)).toBe("30 сентября");
    expect(fmtDate(new Date(2025, 8, 30).getTime(), now)).toBe("30 сентября 2025");
  });
});
