"use client";


const WarnIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
    <path d="M12 3.5 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5z" />
    <path d="M12 10v4.5M12 17.6v.1" />
  </svg>
);

// Спокойный список предупреждений в тонированной карточке (без «пилюль»)
export default function Notice({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div role="status" className="rise rounded-[20px] p-4" style={{ background: "color-mix(in srgb, var(--warn) 11%, var(--surface))", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--warn) 22%, transparent)" }}>
      <p className="px-0.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-warn">{title}</p>
      <ul className="mt-2 divide-y" style={{ borderColor: "color-mix(in srgb, var(--warn) 18%, transparent)" }}>
        {items.map((m, i) => (
          <li key={i} className="flex items-start gap-3 py-2.5 first:pt-1 last:pb-0.5 text-[15px] leading-snug text-ink" style={{ borderColor: "color-mix(in srgb, var(--warn) 18%, transparent)" }}>
            <span className="text-warn"><WarnIcon /></span>
            <span className="min-w-0 break-words">{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
