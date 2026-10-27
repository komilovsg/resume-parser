"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

type Props = {
  title: string;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  // float: плавающая карточка справа внизу на ≥640px (без скрима, как чат); side: модальная боковая панель
  variant: "float" | "side";
  // true — вернуть фокус на элемент, открывший шит (чат делает это сам)
  restoreFocus?: boolean;
};

// Общий bottom-sheet: role=dialog, Escape, focus trap, свайп вниз за ручку (на мобильном)
export default function Sheet({ title, titleId, closeLabel, onClose, children, variant, restoreFocus = true }: Props) {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus({ preventScroll: true });
    return () => {
      if (restoreFocus && opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, [restoreFocus]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      return onClose();
    }
    if (e.key !== "Tab") return;
    const els = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!els.length) return e.preventDefault();
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  };

  const float = variant === "float";
  return createPortal(
    <div className={`fixed inset-0 z-40 ${float ? "sm:pointer-events-none" : ""}`} onKeyDown={onKey}>
      <div className={`fade absolute inset-0 bg-black/35 ${float ? "sm:hidden" : ""}`} onClick={onClose} aria-hidden />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`pop card absolute inset-x-0 bottom-0 flex flex-col overflow-hidden !rounded-b-none !rounded-t-[28px] outline-none ${
          float
            ? "h-[80dvh] sm:pointer-events-auto sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(640px,calc(100dvh-2rem))] sm:w-[400px] sm:!rounded-[22px]"
            : "h-[80dvh] sm:inset-y-0 sm:inset-x-auto sm:right-0 sm:h-auto sm:w-[440px] sm:!rounded-none sm:!rounded-l-[28px]"
        }`}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: dragging ? "none" : "transform .4s var(--spring-soft)" }}
      >
        <div
          className="flex shrink-0 touch-none justify-center pb-1 pt-2.5 sm:hidden"
          onPointerDown={(e) => {
            start.current = e.clientY;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current !== null && setDrag(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            const d = drag;
            start.current = null;
            setDragging(false);
            if (d > 100) onClose();
            else setDrag(0);
          }}
          onPointerCancel={() => ((start.current = null), setDragging(false), setDrag(0))}
          aria-hidden
        >
          <span className="h-1.5 w-10 rounded-full bg-fill" />
        </div>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-1 sm:pt-4">
          <h2 id={titleId} className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label={closeLabel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
