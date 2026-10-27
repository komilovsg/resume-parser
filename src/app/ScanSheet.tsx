// Резюме, которое «сканируют»: чистый SVG + CSS (transform/opacity), цвета только из токенов темы.
export type ScanMode = "scan" | "ai" | "retry" | "match" | "done";

const R = (x: number, y: number, w: number, h: number, c: string, k: string) => <rect key={`${k}${x}${y}`} className={c} x={x} y={y} width={w} height={h} rx={h / 2} />;

function Content() {
  return (
    <svg viewBox="0 0 200 280" aria-hidden focusable="false" className="scan-svg">
      <circle className="s-av" cx="32" cy="36" r="16" />
      {R(58, 24, 100, 9, "s-hd", "n")}
      {R(58, 40, 70, 6, "s-acc", "p")}
      {R(58, 53, 110, 4, "s-bar", "c")}

      {R(16, 76, 40, 6, "s-acc", "h1")}
      {R(16, 92, 110, 6, "s-hd", "e1")}
      {R(16, 104, 168, 4, "s-bar", "e1a")}
      {R(16, 113, 140, 4, "s-bar", "e1b")}
      {R(16, 128, 96, 6, "s-hd", "e2")}
      {R(16, 140, 168, 4, "s-bar", "e2a")}
      {R(16, 149, 152, 4, "s-bar", "e2b")}
      {R(16, 158, 112, 4, "s-bar", "e2c")}

      {R(16, 176, 60, 6, "s-acc", "h2")}
      {R(16, 192, 120, 6, "s-hd", "d1")}
      {R(16, 204, 168, 4, "s-bar", "d1a")}
      {R(16, 213, 130, 4, "s-bar", "d1b")}

      {R(16, 232, 36, 6, "s-acc", "h3")}
      {R(16, 248, 34, 14, "s-pill", "k1")}
      {R(54, 248, 44, 14, "s-pill", "k2")}
      {R(102, 248, 30, 14, "s-pill", "k3")}
      {R(136, 248, 38, 14, "s-pill", "k4")}
    </svg>
  );
}

// блоки, которые «извлекает» ИИ — по порядку
const BOXES: [number, number, number, number][] = [
  [6, 10, 188, 58],
  [6, 70, 188, 98],
  [6, 170, 188, 54],
  [6, 226, 188, 44],
];

export default function ScanSheet({ mode }: { mode: ScanMode }) {
  return (
    <div className="scan" data-mode={mode} aria-hidden>
      <div className="scan-sheet">
        <div className="scan-clip">
          <div className="scan-layer scan-base"><Content /></div>
          <div className="scan-win">
            <div className="scan-layer scan-unwin"><div className="scan-layer scan-lit"><Content /></div></div>
          </div>
          <svg viewBox="0 0 200 280" className="scan-svg scan-over" focusable="false">
            {BOXES.map(([x, y, w, h], i) => (
              <g key={i} className="hl" style={{ ["--i" as string]: i }}>
                <rect className="hl-box" x={x} y={y} width={w} height={h} rx="10" />
                <g className="hl-chk" style={{ ["--i" as string]: i }}>
                  <circle cx={x + w - 14} cy={y + 14} r="8" />
                  <path d={`M${x + w - 18} ${y + 14}l3 3 5-6`} />
                </g>
              </g>
            ))}
          </svg>
          <div className="scan-line"><i /></div>
          <div className="scan-tint" />
        </div>
      </div>
      <span className="scan-badge scan-warn">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 7v6M12 17v.1" /></svg>
      </span>
      <span className="scan-badge scan-ok">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5l4 4 8-9" /></svg>
      </span>
    </div>
  );
}
