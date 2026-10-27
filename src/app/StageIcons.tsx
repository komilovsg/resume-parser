const base = { viewBox: "0 0 72 72", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", className: "ico", "aria-hidden": true } as const;

// Иконка ошибки; состояния загрузки рисует ScanSheet
export default function StageIcon({ kind }: { kind: "error" }) {
  void kind;
  return (
    <svg {...base} style={{ color: "var(--danger)" }}>
      <g className="ico-shake">
        <g transform="translate(22 12)">
          <path className="soft" d="M0 4a4 4 0 0 1 4-4h16l8 8v32a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z" />
          <path d="M20 0v8h8" />
          <path d="M7 20h14M7 27h14M7 34h9" strokeWidth="2" />
        </g>
        <path d="M36 28v9" strokeWidth="3" />
        <circle cx="36" cy="43" r="1.6" fill="currentColor" />
      </g>
    </svg>
  );
}
