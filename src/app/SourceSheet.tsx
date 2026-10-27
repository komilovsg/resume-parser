"use client";

import { useEffect, useMemo, useRef } from "react";
import { locate } from "@/lib/parser/verify";
import Sheet from "./Sheet";

export type SourceReq = { label: string; value: string; edited: boolean; image?: boolean };

// «Источник»: текст документа с подсветкой найденного значения (только React-узлы, без innerHTML)
export default function SourceSheet({ req, text, onClose }: { req: SourceReq; text: string; onClose: () => void }) {
  const span = useMemo(() => (req.image ? null : locate(req.value, text)), [req.value, req.image, text]);
  const mark = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mark.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [span]);

  return (
    <Sheet variant="side" title="Источник" titleId="source-title" closeLabel="Закрыть источник" onClose={onClose}>
      <div className="shrink-0 px-5 pb-2 pt-3">
        <p className="text-[13px] text-muted">{req.label}</p>
        <p className="break-words text-[15px] font-medium leading-snug">{req.value}</p>
        {!span && (
          <p role="status" className="mt-3 rounded-[14px] bg-fill px-3.5 py-3 text-[15px] leading-snug">
            {req.image
              ? "Значение распознано с изображения в документе — в тексте его нет"
              : req.edited
              ? "Не нашли это в документе — значение изменено вручную."
              : "Не нашли это в документе — возможно, значение исправлено вручную или выведено ИИ"}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2" tabIndex={0} aria-label="Текст документа">
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {span ? (
            <>
              {text.slice(0, span.start)}
              <mark ref={mark} className="src-mark">{text.slice(span.start, span.end)}</mark>
              {text.slice(span.end)}
            </>
          ) : (
            text
          )}
        </p>
      </div>
    </Sheet>
  );
}
