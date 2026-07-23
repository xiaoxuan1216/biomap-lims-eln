import { FEATURE_COLORS } from "@/lib/labels";

export interface MapFeature {
  id: number | string;
  name: string;
  start: number;
  end: number;
  strand: number;
  color: string;
  type?: string;
}

interface MapProps {
  name: string;
  length: number;
  gc?: number | null;
  features: MapFeature[];
}

function featColor(f: MapFeature): string {
  return FEATURE_COLORS[f.color] ?? FEATURE_COLORS.teal;
}

// ─── 环形图谱 ───────────────────────────────────────────────────────────
export function CircularMap({ name, length, gc, features }: MapProps) {
  const size = 620;
  const cx = size / 2;
  const cy = size / 2;
  const r = 190;
  const angle = (pos: number) => ((pos - 1) / length) * Math.PI * 2 - Math.PI / 2;
  const pt = (a: number, rad: number) => ({
    x: cx + rad * Math.cos(a),
    y: cy + rad * Math.sin(a),
  });

  const arcs = features.map((f) => {
    const a1 = angle(f.start);
    const a2 = angle(Math.min(f.end, length));
    const p1 = pt(a1, r);
    const p2 = pt(a2, r);
    const large = a2 - a1 > Math.PI ? 1 : 0;
    // 箭头
    const tipA = f.strand === -1 ? a1 : a2;
    const dir = f.strand === -1 ? -1 : 1;
    const tangent = {
      x: dir * -Math.sin(tipA) * dir === 0 ? 0 : -Math.sin(tipA) * dir,
      y: Math.cos(tipA) * dir,
    };
    const tip = pt(tipA, r);
    const normal = { x: Math.cos(tipA), y: Math.sin(tipA) };
    const bw = 9;
    const bl = 16;
    const arrow = [
      `${tip.x + tangent.x * 4},${tip.y + tangent.y * 4}`,
      `${tip.x - tangent.x * bl + normal.x * bw},${tip.y - tangent.y * bl + normal.y * bw}`,
      `${tip.x - tangent.x * bl - normal.x * bw},${tip.y - tangent.y * bl - normal.y * bw}`,
    ].join(" ");
    const midA = (a1 + a2) / 2;
    const labelPt = pt(midA, r + 58);
    const line1 = pt(midA, r + 10);
    const line2 = pt(midA, r + 50);
    const span = ((f.end - f.start) / length) * 100;
    return { f, p1, p2, large, arrow, labelPt, line1, line2, midA, span };
  });

  // 刻度（12 等分）
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const pos = Math.round((i / 12) * length) + 1;
    const a = angle(pos);
    const p1 = pt(a, r - 14);
    const p2 = pt(a, r - 4);
    const lp = pt(a, r - 26);
    return { a, p1, p2, lp, label: pos >= 1000 ? `${(pos / 1000).toFixed(1)}k` : String(pos) };
  });

  return (
    <svg viewBox={`-80 0 ${size + 160} ${size}`} className="w-full max-w-[640px] mx-auto">
      {/* 骨架 */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#cbd5e1" strokeWidth="5" />
      {/* 刻度 */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y} stroke="#94a3b8" strokeWidth="1.5" />
          <text x={t.lp.x} y={t.lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#94a3b8">
            {t.label}
          </text>
        </g>
      ))}
      {/* 特性弧 */}
      {arcs.map(({ f, p1, p2, large, arrow, labelPt, line1, line2, midA, span }, i) => (
        <g key={i}>
          <path
            d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`}
            fill="none"
            stroke={featColor(f)}
            strokeWidth="11"
            strokeLinecap="butt"
            opacity="0.9"
          />
          <polygon points={arrow} fill={featColor(f)} />
          {span > 2 && (
            <>
              <line x1={line1.x} y1={line1.y} x2={line2.x} y2={line2.y} stroke="#94a3b8" strokeWidth="0.8" />
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor={Math.cos(midA) > 0.15 ? "start" : Math.cos(midA) < -0.15 ? "end" : "middle"}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="600"
                fill="#334155"
              >
                {f.name.length > 14 ? f.name.split("(")[0].trim() : f.name}
              </text>
            </>
          )}
        </g>
      ))}
      {/* 中心信息 */}
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize="17" fontWeight="700" fill="#0f172a">
        {name.length > 22 ? name.slice(0, 22) + "…" : name}
      </text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize="13" fill="#64748b">
        {length.toLocaleString()} bp
      </text>
      {gc != null && (
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="12" fill="#14b8a6" fontWeight="600">
          GC {gc}%
        </text>
      )}
    </svg>
  );
}

// ─── 线性图谱 ───────────────────────────────────────────────────────────
export function LinearMap({ name, length, features }: MapProps) {
  const width = 860;
  const pad = 40;
  const trackW = width - pad * 2;
  const x = (pos: number) => pad + ((pos - 1) / length) * trackW;
  const y = 70;
  const h = 12;

  // 刻度
  const tickCount = Math.min(12, Math.max(4, Math.floor(length / 100)));
  const step = length / tickCount;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const realPos = i === tickCount ? length : Math.round(i * step) + 1;
    return { px: x(realPos), label: realPos >= 1000 ? `${(realPos / 1000).toFixed(1)}k` : String(realPos) };
  });

  // 标签分行（避免相邻特性标签重叠，最多 3 行交错）
  const estW = (s: string) => [...s].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 11.5 : 6.5), 0);
  const rowEnds: number[] = [];
  const labelRow = (startX: number, textW: number) => {
    for (let row = 0; row < 3; row++) {
      if ((rowEnds[row] ?? -Infinity) + 8 <= startX) {
        rowEnds[row] = startX + textW;
        return row;
      }
    }
    return -1; // 放不下则隐藏
  };

  return (
    <svg viewBox={`0 0 ${width} 150`} className="w-full">
      {/* 骨架 */}
      <line x1={pad} y1={y + 14} x2={width - pad} y2={y + 14} stroke="#cbd5e1" strokeWidth="6" strokeLinecap="round" />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={t.px} y1={y + 22} x2={t.px} y2={y + 30} stroke="#94a3b8" strokeWidth="1.5" />
          <text x={t.px} y={y + 42} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {t.label}
          </text>
        </g>
      ))}
      {/* 特性箭头 */}
      {features.map((f, i) => {
        const x1 = x(f.start);
        const x2 = x(Math.min(f.end, length));
        const w = Math.max(x2 - x1, 10);
        const fwd = f.strand !== -1;
        const head = Math.min(12, w * 0.4);
        const ay = y + 14;
        const points = fwd
          ? `${x1},${ay - h} ${x1 + w - head},${ay - h} ${x1 + w},${ay} ${x1 + w - head},${ay + h} ${x1},${ay + h}`
          : `${x1 + w},${ay - h} ${x1 + head},${ay - h} ${x1},${ay} ${x1 + head},${ay + h} ${x1 + w},${ay + h}`;
        const label = f.name.length > 14 ? f.name.split("(")[0].trim() : f.name;
        const lx = fwd ? x1 + 4 : x1 + w - 4 - estW(label);
        const row = w > 40 ? labelRow(lx, estW(label)) : -1;
        return (
          <g key={i}>
            <polygon points={points} fill={featColor(f)} opacity="0.9" />
            {row >= 0 && (
              <text
                x={fwd ? x1 + 4 : x1 + w - 4}
                y={ay - h - 6 - row * 16}
                fontSize="11"
                fontWeight="600"
                fill="#334155"
                textAnchor={fwd ? "start" : "end"}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
      <text x={pad} y={24} fontSize="13" fontWeight="700" fill="#0f172a">
        {name} · {length.toLocaleString()} bp
      </text>
    </svg>
  );
}
