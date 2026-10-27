"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKey } from "react";
import { createPortal } from "react-dom";

export type Photo = { id: number; url: string };

type Props = {
  items: Photo[];
  max: number;
  onMove: (from: number, to: number) => void;
  onRemove: (id: number) => void;
  onAdd: (files: FileList | null, camera: boolean) => void;
  onSend: () => void;
};

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const HOLD_MS = 250;
type Drag = { id: number; sx: number; sy: number; gx: number; gy: number; type: string; active: boolean; timer?: ReturnType<typeof setTimeout> };

export default function PhotoGrid({ items, max, onMove, onRemove, onAdd, onSend }: Props) {
  const grid = useRef<HTMLUListElement>(null);
  const els = useRef(new Map<number, HTMLLIElement>());
  const pos = useRef(new Map<number, { x: number; y: number }>());
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  });
  const drag = useRef<Drag | null>(null);
  const [lift, setLift] = useState<{ id: number; tx: number; ty: number } | null>(null);
  const [grabbed, setGrabbed] = useState<number | null>(null);
  const [say, setSay] = useState("");
  const [view, setView] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const suppress = useRef(false);

  // FLIP: соседи плавно перетекают на новые места
  useLayoutEffect(() => {
    const spring = getComputedStyle(document.documentElement).getPropertyValue("--spring-soft").trim() || "ease-out";
    const next = new Map<number, { x: number; y: number }>();
    for (const [id, el] of els.current) {
      const p = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, p);
      const prev = pos.current.get(id);
      if (!prev || reduced() || drag.current?.id === id) continue;
      const dx = prev.x - p.x;
      const dy = prev.y - p.y;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 380, easing: spring });
    }
    pos.current = next;
  }, [items]);

  const slotAt = (x: number, y: number) => {
    const lis = itemsRef.current.map((p) => els.current.get(p.id));
    return lis.findIndex((el) => el && x >= el.offsetLeft && x <= el.offsetLeft + el.offsetWidth && y >= el.offsetTop && y <= el.offsetTop + el.offsetHeight);
  };

  const end = () => {
    const d = drag.current;
    if (d?.timer) clearTimeout(d.timer);
    if (d?.active) suppress.current = true;
    drag.current = null;
    setLift(null);
    window.removeEventListener("pointermove", onMoveWin);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };

  function onMoveWin(e: PointerEvent) {
    const d = drag.current;
    const g = grid.current;
    if (!d || !g) return;
    if (!d.active) {
      const far = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
      if (d.type === "mouse" ? far > 4 : far > 8) {
        if (d.type === "mouse") start(d);
        else end(); // палец поехал — это прокрутка
      }
      return;
    }
    const r = g.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const el = els.current.get(d.id)!;
    const from = itemsRef.current.findIndex((p) => p.id === d.id);
    const to = slotAt(x, y);
    if (to >= 0 && to !== from) onMove(from, to);
    // тянем от текущего «естественного» места тайла
    setLift({ id: d.id, tx: x - d.gx - el.offsetLeft, ty: y - d.gy - el.offsetTop });
  }

  function start(d: Drag) {
    d.active = true;
    navigator.vibrate?.(10);
    setLift({ id: d.id, tx: 0, ty: 0 });
  }

  const down = (e: React.PointerEvent, id: number) => {
    if (e.button !== 0 || drag.current) return;
    const el = els.current.get(id)!;
    const r = grid.current!.getBoundingClientRect();
    const d = { id, sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left - el.offsetLeft, gy: e.clientY - r.top - el.offsetTop, type: e.pointerType, active: false } as Drag;
    drag.current = d;
    if (e.pointerType !== "mouse") d.timer = setTimeout(() => drag.current === d && start(d), HOLD_MS);
    window.addEventListener("pointermove", onMoveWin);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // на таче после долгого нажатия палец не должен прокручивать страницу
  useEffect(() => {
    const g = grid.current;
    const block = (e: TouchEvent) => drag.current?.active && e.preventDefault();
    g?.addEventListener("touchmove", block, { passive: false });
    return () => {
      g?.removeEventListener("touchmove", block);
      window.removeEventListener("pointermove", onMoveWin);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = (e: RKey, i: number, id: number) => {
    if (e.key === " ") {
      e.preventDefault();
      if (grabbed === id) {
        setGrabbed(null);
        setSay(`Страница ${i + 1} на месте`);
      } else {
        setGrabbed(id);
        setSay(`Страница ${i + 1} взята, стрелки перемещают, пробел — отпустить`);
      }
    } else if (grabbed === id && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const to = i + (e.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= items.length) return;
      onMove(i, to);
      setSay(`Страница ${i + 1} перемещена на место ${to + 1}`);
    } else if (grabbed === id && e.key === "Escape") {
      setGrabbed(null);
    }
  };

  return (
    <div className="w-full text-left">
      <div className="mb-3 text-center">
        <p className="text-[17px] font-semibold tracking-[-0.015em]">Страницы резюме · {items.length} из {max}</p>
        {items.length > 1 && <p className="mt-0.5 text-[13px] text-muted">Перетащите, чтобы изменить порядок</p>}
      </div>
      <ul ref={grid} className="relative grid grid-cols-3 gap-2.5 max-[359px]:grid-cols-2 sm:grid-cols-4" aria-label="Страницы резюме по порядку">
        {items.map((p, i) => {
          const up = lift?.id === p.id;
          return (
            <li
              key={p.id}
              ref={(el) => {
                if (el) els.current.set(p.id, el);
                else els.current.delete(p.id);
              }}
              className="ph group relative"
              data-lift={up}
              data-grab={grabbed === p.id}
              style={{
                transform: up && !reduced() ? `translate(${lift.tx}px,${lift.ty}px) scale(1.05)` : up ? `translate(${lift.tx}px,${lift.ty}px)` : undefined,
                zIndex: up ? 10 : undefined,
              }}
            >
              <button
                type="button"
                className="ph-main"
                aria-label={`Страница ${i + 1}, просмотр`}
                aria-roledescription="перетаскиваемый элемент"
                onPointerDown={(e) => down(e, p.id)}
                onClick={() => {
                  if (suppress.current) return void (suppress.current = false);
                  setView(i);
                }}
                onKeyDown={(e) => key(e, i, p.id)}
                onKeyUp={(e) => e.key === " " && e.preventDefault()}
                onBlur={() => grabbed === p.id && setGrabbed(null)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" draggable={false} className="size-full object-cover object-top" />
                <span className="ph-eye" aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                  <span className="text-[12px] font-semibold">Просмотр</span>
                </span>
                <span className="ph-num" aria-hidden>{i + 1}</span>
              </button>
              <button type="button" className="ph-x" aria-label={`Удалить страницу ${i + 1}`} onClick={() => onRemove(p.id)}>
                <span aria-hidden>×</span>
              </button>
            </li>
          );
        })}
        {items.length < max && (
          <li>
            <button type="button" className="ph-add" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
              <span className="text-[26px] leading-none" aria-hidden>+</span>
              <span className="text-[13px] font-semibold">Добавить</span>
            </button>
          </li>
        )}
      </ul>
      {adding && items.length < max && (
        <div className="pop mt-3 flex gap-3">
          {([["Камера", true], ["Галерея", false]] as const).map(([label, camera]) => (
            <label key={label} className="btn btn-ghost btn-sm flex-1 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
              {label}
              <input
                type="file"
                accept="image/*"
                multiple={!camera}
                {...(camera ? { capture: "environment" as const } : {})}
                className="sr-only"
                onChange={(e) => {
                  onAdd(e.target.files, camera);
                  e.target.value = "";
                  setAdding(false);
                }}
              />
            </label>
          ))}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{say}</p>
      <button type="button" className="btn btn-primary mt-4 w-full" onClick={onSend}>
        Разобрать ({items.length} фото)
      </button>
      {view !== null && items[Math.min(view, items.length - 1)] && (
        <Viewer
          items={items}
          index={Math.min(view, items.length - 1)}
          setIndex={setView}
          onClose={() => setView(null)}
          onRemove={(id) => {
            if (items.length === 1) setView(null);
            onRemove(id);
          }}
          onFirst={(i) => {
            onMove(i, 0);
            setView(0);
          }}
        />
      )}
    </div>
  );
}

function Viewer({ items, index, setIndex, onClose, onRemove, onFirst }: { items: Photo[]; index: number; setIndex: (i: number) => void; onClose: () => void; onRemove: (id: number) => void; onFirst: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const sx = useRef<number | null>(null);
  const opener = useRef<Element | null>(null);
  const n = items.length;
  const go = (d: number) => setIndex(Math.max(0, Math.min(n - 1, index + d)));

  useEffect(() => {
    opener.current = document.activeElement;
    box.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);

  const onKey = (e: RKey<HTMLDivElement>) => {
    if (e.key === "Escape") return (e.stopPropagation(), onClose());
    if (e.key === "ArrowLeft") return go(-1);
    if (e.key === "ArrowRight") return go(1);
    if (e.key !== "Tab") return;
    const f = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!f.length) return e.preventDefault();
    if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
  };

  return createPortal(
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Страница ${index + 1} из ${n}`} onKeyDown={onKey} className="fade fixed inset-0 z-[80] flex flex-col bg-black text-white outline-none">
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="px-2 text-[15px] font-semibold tabular-nums" aria-hidden>{index + 1} / {n}</span>
        <button type="button" className="grid size-11 place-items-center rounded-full bg-white/15 text-[26px] leading-none" aria-label="Закрыть просмотр" onClick={onClose}>×</button>
      </div>
      <div
        className="relative min-h-0 flex-1 touch-pinch-zoom p-3"
        style={{ touchAction: "pinch-zoom" }}
        onPointerDown={(e) => (sx.current = e.clientX)}
        onPointerUp={(e) => {
          if (sx.current !== null && Math.abs(e.clientX - sx.current) > 50) go(e.clientX < sx.current ? 1 : -1);
          sx.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={items[index].id} src={items[index].url} alt={`Страница ${index + 1}`} draggable={false} className="fade size-full select-none object-contain" />
        {index > 0 && <button type="button" className="ph-nav left-2" aria-label="Предыдущая страница" onClick={() => go(-1)}>‹</button>}
        {index < n - 1 && <button type="button" className="ph-nav right-2" aria-label="Следующая страница" onClick={() => go(1)}>›</button>}
      </div>
      <div className="flex gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button type="button" className="btn btn-sm flex-1 bg-white/15 text-white" disabled={index === 0} style={{ opacity: index === 0 ? 0.4 : 1 }} onClick={() => onFirst(index)}>Сделать первой</button>
        <button type="button" className="btn btn-sm flex-1 bg-white/15 text-[#ff6b61]" onClick={() => onRemove(items[index].id)}>Удалить</button>
      </div>
    </div>,
    document.body,
  );
}
