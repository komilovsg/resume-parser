"use client";

import { useEffect, useState } from "react";
import type { Resume } from "@/lib/parser/schema";
import type { Profile } from "../types";
import type { Dicts } from "./form";

export type Opt = { id: number; name: string; hint?: string };
export type SearchType = "position" | "skill" | "region" | "specialization";

let dictP: Promise<Dicts> | null = null;
export function loadDicts(): Promise<Dicts> {
  dictP ??= fetch("/api/profile/dict")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Dicts>;
    })
    .catch((e) => {
      dictP = null;
      throw e;
    });
  return dictP;
}

export function useDicts(): { dicts: Dicts | null; failed: boolean } {
  const [s, setS] = useState<{ dicts: Dicts | null; failed: boolean }>({ dicts: null, failed: false });
  useEffect(() => {
    let alive = true;
    loadDicts().then(
      (dicts) => alive && setS({ dicts, failed: false }),
      () => alive && setS({ dicts: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

export async function searchDict(type: SearchType, q: string, signal?: AbortSignal): Promise<Opt[]> {
  const res = await fetch(`/api/profile/search?type=${type}&q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { items: Opt[] }).items;
}

// Тот же конвейер, что и вкладка «Анкета»: резюме -> сопоставление со справочниками
export async function fetchProfile(resume: Resume, signal?: AbortSignal): Promise<Profile> {
  const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume }), signal });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as Profile;
}
