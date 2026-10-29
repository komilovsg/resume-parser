"use client";

import { useState } from "react";
import type { Resume } from "@/lib/parser/schema";
import type { ProfileView } from "@/lib/profile/view";
import { currencyOpts, employmentOpts, periodOpts, periodCode, scheduleOpts, timeToWorkOpts, ymLabel, type Dicts } from "./form";
import type { Picks } from "./store";
import { Check, Group, IEdit, IPlus, ITrash, IX, MultiSelect, SelectField, TextField, Toggle, Typeahead } from "./ui";

export type Ctx = {
  r: Resume;
  p: Picks;
  setR: (f: (r: Resume) => Resume) => void;
  setP: (patch: Partial<Picks>) => void;
  dicts: Dicts | null;
  view: ProfileView | null;
  posError: boolean;
  posRef: React.Ref<HTMLInputElement>;
};

const muted = { color: "var(--yd-muted)" } as const;
const notInDict = (text: string | null | undefined) => (text ? `В резюме: «${text}» — нет в справочнике` : undefined);
const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
const toggleIn = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
const AddBtn = ({ onClick, children = "Добавить", disabled }: { onClick: () => void; children?: string; disabled?: boolean }) => (
  <button type="button" className="yd-btn w-full" onClick={onClick} disabled={disabled} aria-disabled={disabled}>
    <IPlus />
    {children}
  </button>
);
const RowBtns = ({ onEdit, onDel, name }: { onEdit?: () => void; onDel: () => void; name: string }) => (
  <div className="-mr-2 -mt-2 flex shrink-0">
    {onEdit && (
      <button type="button" className="grid size-11 place-items-center rounded-full" aria-label={`Редактировать: ${name}`} onClick={onEdit}><IEdit /></button>
    )}
    <button type="button" className="grid size-11 place-items-center rounded-full" aria-label={`Удалить: ${name}`} onClick={onDel}><ITrash /></button>
  </div>
);
const itemBox = { border: "1px solid var(--yd-line)" } as const;

// ---------- 1. Опыт работы ----------
export function Experience({ r, p, setR, setP, posError, posRef }: Ctx) {
  const [open, setOpen] = useState<number | null>(null);
  const posText = r.desiredPosition ?? r.experience[0]?.position ?? null;
  const upd = (i: number, patch: Partial<Resume["experience"][number]>) => setR((x) => ({ ...x, experience: x.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  return (
    <div className="space-y-5">
      <Typeahead
        label="Должность"
        required
        type="position"
        display={p.position?.name ?? null}
        error={posError && !p.position ? "Выберите должность из справочника" : null}
        hint={p.position === null ? notInDict(posText) : undefined}
        fieldRef={posRef}
        onPick={(o) => {
          setP({ position: { id: o.id, name: o.name } });
          setR((x) => ({ ...x, desiredPosition: o.name }));
        }}
        onClear={() => setP({ position: null })}
      />
      <div>
        <h3 className="text-[17px] font-bold">Опыт работы<span style={{ color: "var(--yd-err)" }}>*</span></h3>
        <div className="mt-2">
          <Check checked={!!p.noExperience} onChange={(v) => setP({ noExperience: v })}>У меня нет опыта работы</Check>
        </div>
        <p className="yd-hint !mt-0">Отметьте, если ищете первую работу. Резюме можно будет сохранить без мест работы — расскажите о себе, навыках, укажите образование, заполните остальные разделы. Работодатели обращают внимание на все детали в резюме.</p>
      </div>
      {!p.noExperience && (
        <ul className="space-y-3">
          {r.experience.map((e, i) =>
            open === i ? (
              <li key={i} className="space-y-3 rounded-2xl p-3" style={itemBox}>
                <TextField label="Должность" value={e.position ?? ""} onChange={(v) => upd(i, { position: v || null })} />
                <TextField label="Компания" value={e.company ?? ""} onChange={(v) => upd(i, { company: v || null })} />
                <TextField label="Город" value={e.city ?? ""} onChange={(v) => upd(i, { city: v || null })} />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Начало" type="month" value={e.startDate ?? ""} onChange={(v) => upd(i, { startDate: v || null })} />
                  <TextField label="Окончание" type="month" disabled={e.current} value={e.current ? "" : (e.endDate ?? "")} onChange={(v) => upd(i, { endDate: v || null })} />
                </div>
                <Check checked={e.current} onChange={(v) => upd(i, v ? { current: true, endDate: null } : { current: false })}>По настоящее время</Check>
                <TextField label="Обязанности и достижения" multiline rows={5} value={e.description ?? ""} onChange={(v) => upd(i, { description: v || null })} />
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className="yd-btn yd-btn-out yd-btn-sm" onClick={() => { setR((x) => ({ ...x, experience: x.experience.filter((_, j) => j !== i) })); setOpen(null); }}>Удалить</button>
                  <button type="button" className="yd-btn yd-btn-sm" onClick={() => setOpen(null)}>Готово</button>
                </div>
              </li>
            ) : (
              <li key={i} className="flex items-start justify-between gap-2 rounded-2xl p-4" style={itemBox}>
                <div className="min-w-0">
                  <p className="text-[13px]" style={muted}>{e.startDate ? `${ymLabel(e.startDate)} — ${e.current ? "по настоящее время" : ymLabel(e.endDate)}` : "Даты не указаны"}</p>
                  <p className="mt-0.5 break-words text-[17px] font-bold leading-snug">{e.position ?? "Должность не указана"}</p>
                  {(e.company || e.city) && <p className="mt-0.5 break-words text-[14px]" style={muted}>{[e.company, e.city].filter(Boolean).join(" • ")}</p>}
                  {e.description && <p className="mt-1 line-clamp-2 break-words text-[14px] opacity-80">{e.description}</p>}
                </div>
                <RowBtns name={e.position ?? "место работы"} onEdit={() => setOpen(i)} onDel={() => setR((x) => ({ ...x, experience: x.experience.filter((_, j) => j !== i) }))} />
              </li>
            ),
          )}
        </ul>
      )}
      <AddBtn
        disabled={!!p.noExperience}
        onClick={() => {
          setR((x) => ({ ...x, experience: [...x.experience, { company: null, position: null, city: null, startDate: null, endDate: null, current: false, description: null }] }));
          setOpen(r.experience.length);
        }}
      />
    </div>
  );
}

// ---------- 2. Условия работы ----------
export function Conditions({ r, p, setR, setP, dicts }: Ctx) {
  const trips = r.businessTrips;
  const ready = trips === "ready" || trips === "often" || trips === "rarely";
  return (
    <div className="space-y-5">
      <MultiSelect label="График работы" options={scheduleOpts(dicts)} value={r.schedule} onChange={(v) => setR((x) => ({ ...x, schedule: v as Resume["schedule"] }))} />
      <Group label="Тип занятости">
        {employmentOpts(dicts).map((o) => (
          <Toggle key={o.value} on={r.employment.includes(o.value as Resume["employment"][number])} onClick={() => setR((x) => ({ ...x, employment: toggleIn(x.employment, o.value as Resume["employment"][number]) }))}>{o.label}</Toggle>
        ))}
      </Group>
      <SelectField label="Время в пути до места работы" value={r.timeToWork ?? ""} options={timeToWorkOpts(dicts)} onChange={(v) => setR((x) => ({ ...x, timeToWork: (v || null) as Resume["timeToWork"] }))} />
      <Group label="Инвалидность">
        <Toggle on={p.disability === true} onClick={() => setP({ disability: p.disability === true ? null : true })}>Да</Toggle>
        <Toggle on={p.disability === false} onClick={() => setP({ disability: p.disability === false ? null : false })}>Нет</Toggle>
      </Group>
      <Group label="Возможность переезда">
        <Toggle on={r.relocation === true} onClick={() => setR((x) => ({ ...x, relocation: x.relocation === true ? null : true }))}>Готов(а) к переезду</Toggle>
        <Toggle on={r.relocation === false} onClick={() => setR((x) => ({ ...x, relocation: x.relocation === false ? null : false }))}>Не готов(а) к переезду</Toggle>
      </Group>
      <Group label="Готов(а) к командировкам">
        <Toggle on={ready} onClick={() => setR((x) => ({ ...x, businessTrips: ready ? null : "ready" }))}>Готов(а)</Toggle>
        <Toggle on={trips === "none"} onClick={() => setR((x) => ({ ...x, businessTrips: x.businessTrips === "none" ? null : "none" }))}>Не готов(а)</Toggle>
      </Group>
      {ready && (
        <Group label="Как часто">
          <Toggle on={trips === "often"} onClick={() => setR((x) => ({ ...x, businessTrips: x.businessTrips === "often" ? "ready" : "often" }))}>Часто</Toggle>
          <Toggle on={trips === "rarely"} onClick={() => setR((x) => ({ ...x, businessTrips: x.businessTrips === "rarely" ? "ready" : "rarely" }))}>Редко</Toggle>
        </Group>
      )}
    </div>
  );
}

// ---------- 3. Желаемая должность ----------
export function Desired({ r, p, setR, setP, dicts }: Ctx) {
  const neg = !!p.negotiable;
  const cur = (r.salary.currency ?? "TJS").toUpperCase();
  const curOpts = currencyOpts(dicts);
  if (!curOpts.some((o) => o.value === cur)) curOpts.push({ value: cur, label: cur });
  const sal = (patch: Partial<Resume["salary"]>) => setR((x) => ({ ...x, salary: { ...x.salary, ...patch } }));
  return (
    <div className="space-y-5">
      <Typeahead
        label="Город или регион"
        type="region"
        display={p.region?.name ?? null}
        hint={p.region === null ? notInDict(r.contacts.city) : undefined}
        onPick={(o) => setP({ region: { id: o.id, name: o.name } })}
        onClear={() => setP({ region: null })}
      />
      <Typeahead
        label="Специализация"
        type="specialization"
        display={p.specialization?.name ?? null}
        hint={p.specialization === null ? notInDict(r.specialization) : undefined}
        onPick={(o) => {
          setP({ specialization: { id: o.id, name: o.name } });
          setR((x) => ({ ...x, specialization: o.name }));
        }}
        onClear={() => setP({ specialization: null })}
      />
      <div>
        <p className="mb-1 text-[14px]" style={muted}>Желаемая зарплата</p>
        <Check checked={neg} onChange={(v) => setP({ negotiable: v })}>Зарплата по договорённости</Check>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextField label="От" type="number" inputMode="numeric" min={0} disabled={neg} value={r.salary.from == null ? "" : String(r.salary.from)} onChange={(v) => sal({ from: num(v) })} />
          <TextField label="До" type="number" inputMode="numeric" min={0} disabled={neg} value={r.salary.to == null ? "" : String(r.salary.to)} onChange={(v) => sal({ to: num(v) })} />
          <div className="col-span-2 sm:col-span-1">
            <SelectField label="Валюта" value={cur} disabled={neg} options={curOpts} onChange={(v) => sal({ currency: v || null })} />
          </div>
        </div>
        <div className="mt-3">
          <SelectField
            label="Период"
            value={periodCode(r, p) ?? "INC_MONTH"}
            disabled={neg}
            options={periodOpts(dicts)}
            onChange={(v) => {
              setP({ salaryPeriod: v || null });
              sal({ period: v === "INC_MONTH" ? "month" : null });
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- 4. О себе ----------
export function About({ r, setR, files, setFiles, fileErr, setFileErr }: Ctx & { files: { name: string; size: number }[]; setFiles: (f: { name: string; size: number }[]) => void; fileErr: string | null; setFileErr: (m: string | null) => void }) {
  return (
    <div className="space-y-5">
      <TextField label="Опишите себя" multiline rows={6} value={r.summary ?? ""} onChange={(v) => setR((x) => ({ ...x, summary: v || null }))} />
      <div>
        <p className="mb-1 text-[14px]" style={muted}>Портфолио и файлы</p>
        <label className="yd-drop has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2" style={{ outlineColor: "var(--yd-p)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ opacity: .7 }}><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5zM11 12h2v2h2v2h-2v2h-2v-2H9v-2h2z" /></svg>
          Добавить файл
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              const ok = list.filter((f) => /\.(jpe?g|png|pdf)$/i.test(f.name) && f.size <= 5 * 1024 * 1024);
              setFiles([...files, ...ok.map((f) => ({ name: f.name, size: f.size }))]);
              setFileErr(ok.length < list.length ? "Файл не добавлен: нужен JPEG, PNG или PDF до 5 МБ" : null);
            }}
          />
        </label>
        <p className="yd-hint">JPEG, PNG или PDF, до 5 МБ.</p>
        {fileErr && <p className="yd-err" role="alert">{fileErr}</p>}
        {files.length > 0 && (
          <>
            <ul className="mt-2 space-y-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-xl px-3" style={itemBox}>
                  <span className="min-w-0 truncate text-[14px]">{f.name} <span style={muted}>· {Math.max(1, Math.round(f.size / 1024))} КБ</span></span>
                  <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full" aria-label={`Убрать файл ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><IX /></button>
                </li>
              ))}
            </ul>
            <p className="yd-hint">В демо файлы не сохраняются — только на время этой страницы.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- 5. Образование ----------
export function Education({ r, setR }: Ctx) {
  const [open, setOpen] = useState<number | null>(null);
  const upd = (i: number, patch: Partial<Resume["education"][number]>) => setR((x) => ({ ...x, education: x.education.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const yr = (v: string) => (/^\d{4}$/.test(v) ? Number(v) : null);
  return (
    <div className="space-y-3">
      <datalist id="edu-degrees">
        {["Бакалавр", "Магистр", "Специалист", "Кандидат наук", "Доктор наук", "Колледж", "Среднее"].map((d) => (<option key={d} value={d} />))}
      </datalist>
      {r.education.map((e, i) =>
        open === i ? (
          <div key={i} className="space-y-3 rounded-2xl p-3" style={itemBox}>
            <TextField label="Учебное заведение" value={e.institution ?? ""} onChange={(v) => upd(i, { institution: v || null })} />
            <TextField label="Степень" list="edu-degrees" value={e.degree ?? ""} onChange={(v) => upd(i, { degree: v || null })} />
            <TextField label="Специальность" value={e.field ?? ""} onChange={(v) => upd(i, { field: v || null })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Год начала" inputMode="numeric" placeholder="2014" value={e.startYear ? String(e.startYear) : ""} onChange={(v) => upd(i, { startYear: yr(v) })} />
              <TextField label="Год окончания" inputMode="numeric" placeholder="2018" value={e.endYear ? String(e.endYear) : ""} onChange={(v) => upd(i, { endYear: yr(v) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="yd-btn yd-btn-out yd-btn-sm" onClick={() => { setR((x) => ({ ...x, education: x.education.filter((_, j) => j !== i) })); setOpen(null); }}>Удалить</button>
              <button type="button" className="yd-btn yd-btn-sm" onClick={() => setOpen(null)}>Готово</button>
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-start justify-between gap-2 rounded-2xl p-4" style={itemBox}>
            <div className="min-w-0">
              <p className="text-[13px]" style={muted}>{[e.degree, e.startYear && e.endYear ? `${e.startYear}–${e.endYear}` : (e.endYear ?? e.startYear)].filter(Boolean).join(" • ") || "Без степени и дат"}</p>
              <p className="mt-0.5 break-words text-[17px] font-bold leading-snug">{e.institution ?? "Учебное заведение не указано"}</p>
              {e.field && <p className="mt-0.5 break-words text-[14px]" style={muted}>{e.field}</p>}
            </div>
            <RowBtns name={e.institution ?? "образование"} onEdit={() => setOpen(i)} onDel={() => setR((x) => ({ ...x, education: x.education.filter((_, j) => j !== i) }))} />
          </div>
        ),
      )}
      <AddBtn
        onClick={() => {
          setR((x) => ({ ...x, education: [...x.education, { institution: null, degree: null, field: null, startYear: null, endYear: null }] }));
          setOpen(r.education.length);
        }}
      />
    </div>
  );
}

// ---------- 6. Навыки ----------
export function Skills({ r, setR, view }: Ctx) {
  const find = (s: string) => view?.skills.find((k) => k.input.toLowerCase() === s.toLowerCase());
  const add = (name: string) => setR((x) => (x.skills.some((s) => s.toLowerCase() === name.toLowerCase()) ? x : { ...x, skills: [...x.skills, name] }));
  return (
    <div className="space-y-4">
      <Typeahead label="Добавить навык" type="skill" display={null} clearable={false} placeholder="Например, React" onPick={(o) => add(o.name)} onFree={add} freeLabel="Добавить" />
      {r.skills.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {r.skills.map((s) => {
            const m = find(s);
            const unknown = !!m && m.name === null;
            return (
              <li key={s} className="yd-tag !bg-[var(--yd-chip)]" data-dashed={unknown} title={unknown ? "нет в справочнике" : undefined}>
                <span className="break-words">{m?.name ?? s}</span>
                {unknown && <span className="yd-sub">нет в справочнике</span>}
                <button type="button" aria-label={`Убрать навык ${s}`} onClick={() => setR((x) => ({ ...x, skills: x.skills.filter((k) => k !== s) }))}><IX /></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="yd-hint">Навыки не указаны.</p>
      )}
    </div>
  );
}

// ---------- 7. Языки ----------
export function Languages({ r, setR }: Ctx) {
  const upd = (i: number, patch: Partial<Resume["languages"][number]>) => setR((x) => ({ ...x, languages: x.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  return (
    <div className="space-y-3">
      <datalist id="lang-levels">
        {["Элементарный", "Базовый", "Средний", "Продвинутый", "В совершенстве", "Родной"].map((d) => (<option key={d} value={d} />))}
      </datalist>
      {r.languages.map((l, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Язык" value={l.name ?? ""} onChange={(v) => upd(i, { name: v || null })} />
            <TextField label="Уровень" list="lang-levels" value={l.level ?? ""} onChange={(v) => upd(i, { level: v || null })} />
          </div>
          <button type="button" className="mt-1.5 grid size-11 shrink-0 place-items-center rounded-full" aria-label={`Удалить язык ${l.name ?? ""}`} onClick={() => setR((x) => ({ ...x, languages: x.languages.filter((_, j) => j !== i) }))}><ITrash /></button>
        </div>
      ))}
      <AddBtn onClick={() => setR((x) => ({ ...x, languages: [...x.languages, { name: null, level: null }] }))} />
    </div>
  );
}

// ---------- 8. Контакты ----------
export function Contacts({ r, setR }: Ctx) {
  const c = (patch: Partial<Resume["contacts"]>) => setR((x) => ({ ...x, contacts: { ...x.contacts, ...patch } }));
  return (
    <div className="space-y-4">
      <TextField label="ФИО" value={r.fullName ?? ""} onChange={(v) => setR((x) => ({ ...x, fullName: v || null }))} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Телефон" type="tel" inputMode="tel" value={r.contacts.phone ?? ""} onChange={(v) => c({ phone: v || null })} />
        <TextField label="Email" type="email" inputMode="email" value={r.contacts.email ?? ""} onChange={(v) => c({ email: v || null })} />
      </div>
      <TextField label="Город проживания" value={r.contacts.city ?? ""} onChange={(v) => c({ city: v || null })} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Дата рождения" type="date" value={r.birthDate ?? ""} onChange={(v) => setR((x) => ({ ...x, birthDate: v || null }))} />
        <TextField label="Водительские права" value={r.driverLicense ?? ""} onChange={(v) => setR((x) => ({ ...x, driverLicense: v || null }))} />
      </div>
      <div className="space-y-3">
        {r.contacts.links.map((l, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><TextField label="Ссылка" value={l} onChange={(v) => c({ links: r.contacts.links.map((x, j) => (j === i ? v : x)) })} /></div>
            <button type="button" className="mt-1.5 grid size-11 shrink-0 place-items-center rounded-full" aria-label={`Удалить ссылку ${l}`} onClick={() => c({ links: r.contacts.links.filter((_, j) => j !== i) })}><ITrash /></button>
          </div>
        ))}
        <button type="button" className="yd-btn yd-btn-out yd-btn-sm w-full" onClick={() => c({ links: [...r.contacts.links, ""] })}><IPlus />Добавить ссылку</button>
      </div>
    </div>
  );
}
