import { useState } from "react";

// ─── Design Tokens ─────────────────────────────────────────
const T = {
  surface: "#0F1A24",
  surfaceRaised: "#162029",
  surfaceOverlay: "#1E2D3A",
  surfaceBorder: "#2A3A47",
  textHeading: "#E8F0F6",
  text: "#C8D6E0",
  textMuted: "#8A9DAD",
  textSubtle: "#5A6F80",
  interactive: "#1E3A52",
  interactiveHover: "#264A66",
  interactiveBorder: "#3A6080",
  gainFg: "#34D399",
  gainBg: "#1A2D28",
  lossFg: "#F87171",
  lossBg: "#2D1A1A",
  staleFg: "#FBBF24",
  staleBg: "#2A2515",
  staleBorder: "#5A4A1A",
  runningFg: "#60A5FA",
  runningBg: "#1A2A3D",
  pausedFg: "#A78BFA",
};

// ─── Mock Data ─────────────────────────────────────────────
const holdings = [
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", qty: 120, price: 245.3, value: 29436.0, costBasis: 25008.0, pnl: 4428.0, pnlPct: 17.71, dayChg: 1.2, dayChgPct: 0.49, alloc: 20.67 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", qty: 45, price: 488.1, value: 21964.5, costBasis: 19125.0, pnl: 2839.5, pnlPct: 14.85, dayChg: -2.35, dayChgPct: -0.48, alloc: 15.43 },
  { symbol: "SCHD", name: "Schwab US Dividend Equity ETF", qty: 200, price: 82.45, value: 16490.0, costBasis: 15200.0, pnl: 1290.0, pnlPct: 8.49, dayChg: 0.38, dayChgPct: 0.46, alloc: 11.58 },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", qty: 180, price: 72.18, value: 12992.4, costBasis: 13140.0, pnl: -147.6, pnlPct: -1.12, dayChg: -0.05, dayChgPct: -0.07, alloc: 9.13 },
  { symbol: "VWO", name: "Vanguard FTSE Emerging Markets", qty: 250, price: 44.92, value: 11230.0, costBasis: 10750.0, pnl: 480.0, pnlPct: 4.47, dayChg: 0.67, dayChgPct: 1.51, alloc: 7.89 },
  { symbol: "ARKK", name: "ARK Innovation ETF", qty: 85, price: 52.3, value: 4445.5, costBasis: 6375.0, pnl: -1929.5, pnlPct: -30.27, dayChg: -1.84, dayChgPct: -3.4, alloc: 3.12, stale: true },
  { symbol: "VNQ", name: "Vanguard Real Estate ETF", qty: 110, price: 85.6, value: 9416.0, costBasis: 8800.0, pnl: 616.0, pnlPct: 7.0, dayChg: 0.22, dayChgPct: 0.26, alloc: 6.61 },
  { symbol: "GLD", name: "SPDR Gold Shares", qty: 40, price: 228.15, value: 9126.0, costBasis: 7600.0, pnl: 1526.0, pnlPct: 20.08, dayChg: 3.1, dayChgPct: 1.38, alloc: 6.41 },
];

const lots = [
  { id: 1, opened: "2025-06-15", origQty: 50, remQty: 50, costBasis: 10420.0, price: 208.4, pnl: 1845.0 },
  { id: 2, opened: "2025-09-03", origQty: 40, remQty: 40, costBasis: 8720.0, price: 218.0, pnl: 1092.0 },
  { id: 3, opened: "2026-01-10", origQty: 50, remQty: 30, costBasis: 6870.0, price: 229.0, pnl: 489.0 },
];

const transactions = [
  { date: "2026-01-10", symbol: "VTI", type: "BUY", qty: 50, price: 229.0, fees: 0, notes: "Q1 DCA" },
  { date: "2025-11-20", symbol: "VTI", type: "SELL", qty: 20, price: 235.5, fees: 4.95, notes: "Rebalance" },
  { date: "2025-11-15", symbol: "QQQ", type: "BUY", qty: 15, price: 478.25, fees: 0, notes: "" },
  { date: "2025-10-01", symbol: "ARKK", type: "BUY", qty: 85, price: 75.0, fees: 0, notes: "Speculative" },
  { date: "2025-09-03", symbol: "VTI", type: "BUY", qty: 40, price: 218.0, fees: 0, notes: "" },
  { date: "2025-08-20", symbol: "GLD", type: "BUY", qty: 40, price: 190.0, fees: 0, notes: "Hedge" },
  { date: "2025-07-15", symbol: "SCHD", type: "BUY", qty: 200, price: 76.0, fees: 0, notes: "Dividend core" },
  { date: "2025-07-01", symbol: "BND", type: "BUY", qty: 180, price: 73.0, fees: 0, notes: "Bond allocation" },
  { date: "2025-06-15", symbol: "VTI", type: "BUY", qty: 50, price: 208.4, fees: 0, notes: "Initial position" },
  { date: "2025-06-15", symbol: "QQQ", type: "BUY", qty: 30, price: 465.0, fees: 0, notes: "Initial position" },
];

const chartData = (() => {
  const pts = [];
  let val = 118000;
  const d = new Date("2025-06-15");
  while (d <= new Date("2026-02-20")) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      val += (Math.random() - 0.46) * 800;
      val = Math.max(val, 105000);
      pts.push({ date: new Date(d), value: val });
    }
    d.setDate(d.getDate() + 1);
  }
  pts[pts.length - 1].value = 142387.52;
  return pts;
})();

const candleData = (() => {
  const pts = [];
  let c = 208;
  const d = new Date("2025-06-15");
  while (d <= new Date("2026-02-20")) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      const o = c + (Math.random() - 0.5) * 3;
      const h = Math.max(o, c) + Math.random() * 2.5;
      const l = Math.min(o, c) - Math.random() * 2.5;
      c = o + (Math.random() - 0.48) * 4;
      pts.push({ date: new Date(d), o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2) });
    }
    d.setDate(d.getDate() + 1);
  }
  pts[pts.length - 1].c = 245.3;
  return pts;
})();

// ─── Utility ───────────────────────────────────────────────
const fmt = (n, decimals = 2) => {
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (n > 0) return `+$${str}`;
  if (n < 0) return `\u2212$${str}`;
  return `$${str}`;
};
const fmtD = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) => {
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `\u2212${abs}%`;
  return `${abs}%`;
};
const pnlColor = (n) => (n > 0 ? T.gainFg : n < 0 ? T.lossFg : T.text);

// ─── Shared Components ─────────────────────────────────────
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.surfaceBorder}; border-radius: 3px; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulseSlow { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const fontDisplay = "'Crimson Pro', Georgia, serif";
const fontBody = "'DM Sans', -apple-system, sans-serif";
const fontMono = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

function Badge({ children, color, bg, border }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", fontSize: 12, fontWeight: 500, borderRadius: 4,
      color, background: bg, border: border ? `1px solid ${border}` : "none",
      fontFamily: fontBody,
    }}>{children}</span>
  );
}

function Btn({ children, variant = "interactive", onClick, style: s, small }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: small ? "4px 10px" : "8px 16px",
    fontSize: small ? 12 : 14, fontWeight: 500, borderRadius: 8,
    border: "none", cursor: "pointer", transition: "all 0.15s",
    fontFamily: fontBody, lineHeight: 1.4,
  };
  const variants = {
    interactive: { background: T.interactive, color: T.text },
    success: { background: T.gainBg, color: T.gainFg },
    outline: { background: T.surface, color: T.text, border: `1px solid ${T.surfaceBorder}` },
    danger: { background: "#dc2626", color: "#fff" },
  };
  return <button style={{ ...base, ...variants[variant], ...s }} onClick={onClick}>{children}</button>;
}

function Card({ children, style: s }) {
  return (
    <div style={{
      background: T.surfaceRaised, border: `1px solid ${T.surfaceBorder}`,
      borderRadius: 8, ...s,
    }}>{children}</div>
  );
}

// ─── Mini Area Chart (SVG) ─────────────────────────────────
function AreaChart({ data, width = 760, height = 220 }) {
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals) * 0.998;
  const max = Math.max(...vals) * 1.002;
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.value - min) / range) * (height - 20) - 10;
    return `${x},${y}`;
  });
  const line = pts.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gridLines = [0.25, 0.5, 0.75].map((f) => height - f * (height - 20) - 10);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {gridLines.map((y, i) => (
        <line key={i} x1={0} y1={y} x2={width} y2={y} stroke={T.surfaceBorder} strokeWidth={0.5} strokeDasharray="4,4" opacity={0.5} />
      ))}
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.runningFg} stopOpacity={0.18} />
          <stop offset="100%" stopColor={T.runningFg} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#areaGrad)" />
      <polyline points={line} fill="none" stroke={T.runningFg} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ─── Mini Candlestick Chart (SVG) ──────────────────────────
function CandleChart({ data, width = 760, height = 280 }) {
  const last90 = data.slice(-90);
  const allH = last90.map((d) => d.h);
  const allL = last90.map((d) => d.l);
  const min = Math.min(...allL) * 0.998;
  const max = Math.max(...allH) * 1.002;
  const range = max - min || 1;
  const barW = Math.max(2, (width / last90.length) * 0.7);
  const gap = width / last90.length;
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((f) => height - f * (height - 20) - 10);
  const gridVals = [0.2, 0.4, 0.6, 0.8].map((f) => (min + f * range).toFixed(0));

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {gridLines.map((y, i) => (
        <g key={i}>
          <line x1={0} y1={y} x2={width} y2={y} stroke={T.surfaceBorder} strokeWidth={0.5} strokeDasharray="4,4" opacity={0.4} />
          <text x={width - 4} y={y - 4} fill={T.textSubtle} fontSize={9} textAnchor="end" fontFamily={fontBody}>${gridVals[i]}</text>
        </g>
      ))}
      {last90.map((d, i) => {
        const x = i * gap + gap / 2;
        const up = d.c >= d.o;
        const color = up ? T.gainFg : T.lossFg;
        const yH = height - ((d.h - min) / range) * (height - 20) - 10;
        const yL = height - ((d.l - min) / range) * (height - 20) - 10;
        const yO = height - ((d.o - min) / range) * (height - 20) - 10;
        const yC = height - ((d.c - min) / range) * (height - 20) - 10;
        const bodyTop = Math.min(yO, yC);
        const bodyH = Math.max(1, Math.abs(yO - yC));
        return (
          <g key={i}>
            <line x1={x} y1={yH} x2={x} y2={yL} stroke={color} strokeWidth={1} />
            <rect x={x - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={color} rx={0.5} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Screen 1: Dashboard ───────────────────────────────────
function DashboardScreen() {
  const [window_, setWindow_] = useState("3M");
  const windows = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

  return (
    <div style={{ animation: "fadeUp 0.4s ease-out" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4 }}>
          <span style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 600, color: T.textHeading, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
            $142,387.52
          </span>
          <span style={{ fontFamily: fontBody, fontSize: 16, fontWeight: 500, color: T.gainFg, fontVariantNumeric: "tabular-nums" }}>
            +$1,204.31 (+0.85%)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: fontBody, fontSize: 13, color: T.textMuted }}>Total Portfolio Value</span>
          <span style={{ color: T.surfaceBorder }}>|</span>
          <span style={{ fontFamily: fontBody, fontSize: 12, color: T.textSubtle }}>Feb 20, 2026 3:42 PM ET</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
          {windows.map((w) => (
            <button key={w} onClick={() => setWindow_(w)} style={{
              padding: "4px 14px", fontSize: 12, fontWeight: 500, borderRadius: 6,
              border: window_ === w ? "none" : `1px solid ${T.surfaceBorder}`,
              background: window_ === w ? T.interactive : T.surface,
              color: window_ === w ? T.textHeading : T.textMuted,
              cursor: "pointer", fontFamily: fontBody, transition: "all 0.15s",
            }}>{w}</button>
          ))}
        </div>
      </div>

      <Card style={{ padding: "16px 0 0", marginBottom: 20, overflow: "hidden" }}>
        <AreaChart data={chartData} height={200} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderTop: `1px solid ${T.surfaceBorder}` }}>
          {["Jun 2025", "Sep 2025", "Dec 2025", "Feb 2026"].map((l) => (
            <span key={l} style={{ fontSize: 11, color: T.textSubtle, fontFamily: fontBody }}>{l}</span>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Gain / Loss", val: "+$12,847.20", pct: "+9.93%", color: T.gainFg },
          { label: "Realized PnL", val: "+$3,210.00", color: T.gainFg },
          { label: "Unrealized PnL", val: "+$9,637.20", color: T.gainFg },
        ].map((c, i) => (
          <Card key={i} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: T.textMuted, fontFamily: fontBody, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: c.color, fontFamily: fontBody, fontVariantNumeric: "tabular-nums" }}>{c.val}</div>
            {c.pct && <div style={{ fontSize: 13, color: c.color, fontFamily: fontBody, marginTop: 2 }}>{c.pct}</div>}
          </Card>
        ))}
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 500, color: T.textHeading }}>Holdings</span>
          <span style={{ fontSize: 12, color: T.textMuted, fontFamily: fontBody }}>{holdings.length} instruments</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontBody, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.surfaceBorder}` }}>
                {["Symbol", "Name", "Qty", "Price", "Mkt Value", "Unrealized PnL", "Day Chg", "Alloc"].map((h, i) => (
                  <th key={i} style={{
                    padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.textMuted,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    textAlign: i < 2 ? "left" : "right", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.surfaceBorder}40`, cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = T.surfaceOverlay}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: T.textHeading }}>{h.symbol}</td>
                  <td style={{ padding: "10px 12px", color: T.textMuted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{h.qty}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>
                    {fmtD(h.price)}
                    {h.stale && <span title="Stale — 3h ago" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.staleFg, marginLeft: 6, verticalAlign: "middle" }} />}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textHeading, fontWeight: 500 }}>{fmtD(h.value)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: pnlColor(h.pnl) }}>{fmt(h.pnl)}</span>
                    <span style={{ color: pnlColor(h.pnl), fontSize: 11, marginLeft: 6 }}>({fmtPct(h.pnlPct)})</span>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: pnlColor(h.dayChg), fontSize: 12 }}>
                    {fmtPct(h.dayChgPct)}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textMuted }}>{h.alloc.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{
        marginTop: 16, padding: "10px 16px", borderRadius: 8,
        background: T.staleBg, border: `1px solid ${T.staleBorder}`,
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 13, color: T.staleFg, fontFamily: fontBody,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Prices as of 3:42 PM ET — ARKK quote stale (3 hours)
      </div>
    </div>
  );
}

// ─── Screen 2: Empty Dashboard ─────────────────────────────
function EmptyDashboardScreen() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: 460, animation: "fadeUp 0.4s ease-out",
    }}>
      <div style={{ width: 360, textAlign: "center", padding: 48, borderRadius: 16, background: `radial-gradient(ellipse at center, ${T.surfaceRaised} 0%, ${T.surface} 70%)` }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.interactive, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.runningFg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 600, color: T.textHeading, marginBottom: 10, lineHeight: 1.3 }}>
          Add your first holding to start tracking your portfolio.
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: 14, color: T.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
          Search for a ticker symbol to add an instrument and begin recording trades.
        </p>
        <Btn variant="interactive" style={{ padding: "10px 24px", fontSize: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Instrument
        </Btn>
      </div>
    </div>
  );
}

// ─── Screen 3: Holding Detail ──────────────────────────────
function HoldingDetailScreen() {
  const [range, setRange] = useState("3M");
  const ranges = ["1M", "3M", "6M", "1Y", "ALL"];

  return (
    <div style={{ animation: "fadeUp 0.4s ease-out" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.textMuted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 600, color: T.textHeading }}>VTI</span>
          <span style={{ fontFamily: fontBody, fontSize: 14, color: T.textMuted }}>Vanguard Total Stock Market ETF</span>
        </div>
      </div>

      <Card style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: `1px solid ${T.surfaceBorder}` }}>
          {[
            { label: "Shares", val: "120", color: T.textHeading },
            { label: "Avg Cost", val: "$208.40", color: T.textHeading },
            { label: "Market Value", val: "$29,436.00", color: T.textHeading },
            { label: "Unrealized PnL", val: "+$4,428.00", sub: "+17.71%", color: T.gainFg },
          ].map((c, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? `1px solid ${T.surfaceBorder}` : "none" }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontFamily: fontBody, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: c.color, fontFamily: fontBody, fontVariantNumeric: "tabular-nums" }}>{c.val}</div>
              {c.sub && <div style={{ fontSize: 12, color: c.color, marginTop: 2, fontFamily: fontBody }}>{c.sub}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          {[
            { label: "Day Change", val: "+$1.20", sub: "+0.49%", color: T.gainFg },
            { label: "Realized PnL", val: "+$1,540.00", color: T.gainFg },
            { label: "Total Return", val: "+$5,968.00", color: T.gainFg },
            { label: "Cost Basis", val: "$25,008.00", color: T.textHeading },
          ].map((c, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? `1px solid ${T.surfaceBorder}` : "none" }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontFamily: fontBody, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: c.color, fontFamily: fontBody, fontVariantNumeric: "tabular-nums" }}>{c.val}</div>
              {c.sub && <div style={{ fontSize: 12, color: c.color, marginTop: 2, fontFamily: fontBody }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 500, color: T.textHeading }}>Price History</span>
          <div style={{ display: "flex", gap: 4 }}>
            {ranges.map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: "3px 10px", fontSize: 11, fontWeight: 500, borderRadius: 5,
                border: range === r ? "none" : `1px solid ${T.surfaceBorder}`,
                background: range === r ? T.interactive : "transparent",
                color: range === r ? T.textHeading : T.textMuted,
                cursor: "pointer", fontFamily: fontBody, transition: "all 0.15s",
              }}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "12px 0 0" }}>
          <CandleChart data={candleData} height={240} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 16px 10px" }}>
          {["Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026"].map((l) => (
            <span key={l} style={{ fontSize: 10, color: T.textSubtle, fontFamily: fontBody }}>{l}</span>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.surfaceBorder}` }}>
          <span style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 500, color: T.textHeading }}>FIFO Lots</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontBody, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.surfaceBorder}` }}>
              {["#", "Opened", "Orig Qty", "Rem Qty", "Cost/Share", "Cost Basis", "Unrealized PnL"].map((h, i) => (
                <th key={i} style={{
                  padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  textAlign: i < 2 ? "left" : "right",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${T.surfaceBorder}40` }}>
                <td style={{ padding: "10px 12px", fontFamily: fontMono, fontSize: 12, color: T.textSubtle }}>{l.id}</td>
                <td style={{ padding: "10px 12px", color: T.text }}>{l.opened}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textMuted }}>{l.origQty}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{l.remQty}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textMuted }}>{fmtD(l.price)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtD(l.costBasis)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: pnlColor(l.pnl) }}>{fmt(l.pnl)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${T.surfaceBorder}` }}>
              <td colSpan={3} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: T.textMuted }}>TOTAL</td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textHeading, fontWeight: 600 }}>120</td>
              <td style={{ padding: "10px 12px" }}></td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.textHeading, fontWeight: 600 }}>{fmtD(26010)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.gainFg, fontWeight: 600 }}>{fmt(3426)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Screen 4: Transactions ────────────────────────────────
function TransactionsScreen() {
  return (
    <div style={{ animation: "fadeUp 0.4s ease-out" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 600, color: T.textHeading }}>Transactions</span>
        <Btn variant="interactive">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Transaction
        </Btn>
      </div>

      <Card style={{ padding: "10px 16px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        {[["All Instruments","VTI","QQQ","SCHD","ARKK"],["All Types","BUY","SELL"]].map((opts, j) => (
          <select key={j} style={{
            padding: "6px 10px", fontSize: 13, borderRadius: 6, border: `1px solid ${T.surfaceBorder}`,
            background: T.surface, color: T.text, fontFamily: fontBody, outline: "none",
          }}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
        ))}
        <span style={{ fontSize: 12, color: T.textSubtle, fontFamily: fontBody, marginLeft: "auto" }}>{transactions.length} transactions</span>
      </Card>

      <Card style={{ overflow: "hidden", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontBody, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.surfaceBorder}` }}>
              {["Date", "Symbol", "Type", "Qty", "Price", "Fees", "Notes", ""].map((h, i) => (
                <th key={i} style={{
                  padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  textAlign: i >= 3 && i < 6 ? "right" : "left",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.surfaceBorder}40`, transition: "background 0.1s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = T.surfaceOverlay}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px 12px", color: T.text, whiteSpace: "nowrap" }}>{t.date}</td>
                <td style={{ padding: "10px 12px", fontWeight: 600, color: T.textHeading }}>{t.symbol}</td>
                <td style={{ padding: "10px 12px" }}>
                  <Badge color={t.type === "BUY" ? T.runningFg : T.textMuted} bg={t.type === "BUY" ? T.runningBg : T.surfaceOverlay} border={t.type === "BUY" ? "#2A4A6A" : T.surfaceBorder}>{t.type}</Badge>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{t.qty}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtD(t.price)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.fees > 0 ? T.text : T.textSubtle }}>{t.fees > 0 ? fmtD(t.fees) : "\u2014"}</td>
                <td style={{ padding: "10px 12px", color: T.textMuted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.notes || "\u2014"}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <span style={{ cursor: "pointer", color: T.textSubtle, marginRight: 10, fontSize: 13 }} title="Edit">&#9998;</span>
                  <span style={{ cursor: "pointer", color: T.textSubtle, fontSize: 13 }} title="Delete">&#128465;</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span style={{ fontSize: 13, color: T.textMuted, fontFamily: fontBody }}>Bulk Import — paste tab-separated transactions</span>
      </Card>
    </div>
  );
}

// ─── Screen 5: Advisor Chat ────────────────────────────────
function AdvisorScreen() {
  const [inputVal, setInputVal] = useState("");
  const messages = [
    { role: "assistant", content: "I can help you analyze your portfolio. I have access to your current holdings, transaction history, and cached market data. What would you like to know?" },
    { role: "user", content: "Which positions are dragging my portfolio down this quarter?" },
    { role: "tool", content: "Looking up portfolio snapshot (Q1 2026)..." },
    { role: "tool", content: "Looking up quotes for all holdings..." },
    { role: "assistant", content: "Looking at your Q1 2026 performance, two positions are detracting from returns:\n\n**ARKK** is your worst performer at \u2212$1,929.50 (\u221230.3%). It represents only 3.1% of your portfolio but accounts for the majority of your unrealized losses. The position was opened at $75.00 per share and is now at $52.30.\n\n**BND** is slightly negative at \u2212$147.60 (\u22121.1%). This is expected for a bond allocation in a rising-rate environment and represents normal portfolio behavior, not a problem.\n\nNote: ARKK's quote is 3 hours stale. The actual loss may differ slightly.\n\nYour remaining six positions are all positive, with GLD (+20.1%) and VTI (+17.7%) leading." },
    { role: "user", content: "If I sold ARKK entirely, what would the realized loss be?" },
    { role: "tool", content: "Looking up ARKK holding and lot details..." },
    { role: "assistant", content: "Selling your entire ARKK position (85 shares) at the current cached price of $52.30 would realize:\n\n**Proceeds:** $4,445.50\n**Cost basis:** $6,375.00 (85 shares \u00d7 $75.00, single lot opened 2025-10-01)\n**Realized loss:** \u2212$1,929.50\n\nThis is a single FIFO lot, so the calculation is straightforward. The full $1,929.50 would be a short-term capital loss (held less than one year).\n\nThat loss could offset up to $1,929.50 of short-term capital gains elsewhere in your portfolio. Your realized gains YTD are +$3,210.00, so harvesting this loss would reduce your net taxable gains to approximately $1,280.50." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: 620, animation: "fadeUp 0.3s ease-out" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.runningFg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 500, color: T.textHeading }}>Advisor</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn variant="outline" small>New</Btn>
          <Btn variant="outline" small>Threads</Btn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => {
          if (m.role === "tool") {
            return (
              <div key={i} style={{
                alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 8,
                background: T.surfaceOverlay, border: `1px solid ${T.surfaceBorder}`,
                fontSize: 12, color: T.textMuted, fontFamily: fontBody,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.runningFg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                {m.content}
              </div>
            );
          }
          if (m.role === "user") {
            return (
              <div key={i} style={{
                alignSelf: "flex-end", maxWidth: "82%",
                padding: "10px 14px", borderRadius: 10,
                background: T.interactive, color: T.text,
                fontSize: 14, fontFamily: fontBody, lineHeight: 1.55,
              }}>{m.content}</div>
            );
          }
          return (
            <div key={i} style={{
              alignSelf: "flex-start", maxWidth: "88%",
              padding: "10px 14px", borderRadius: 10,
              background: T.surfaceOverlay, border: `1px solid ${T.surfaceBorder}`,
              color: T.text, fontSize: 14, fontFamily: fontBody, lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {m.content.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                j % 2 === 1
                  ? <strong key={j} style={{ color: T.textHeading, fontWeight: 500 }}>{part}</strong>
                  : <span key={j}>{part}</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.surfaceBorder}`, flexShrink: 0, display: "flex", gap: 8 }}>
        <input value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="Ask about your portfolio..."
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.surfaceBorder}`, background: T.surface, color: T.text, fontSize: 14, fontFamily: fontBody, outline: "none" }} />
        <button style={{
          width: 40, height: 40, borderRadius: 8, border: "none",
          background: T.interactive, color: T.text, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────
const screens = [
  { id: "dashboard", label: "Dashboard" },
  { id: "empty", label: "Empty State" },
  { id: "detail", label: "Holding Detail" },
  { id: "transactions", label: "Transactions" },
  { id: "advisor", label: "Advisor Chat" },
];

const componentMap = { dashboard: DashboardScreen, empty: EmptyDashboardScreen, detail: HoldingDetailScreen, transactions: TransactionsScreen, advisor: AdvisorScreen };

export default function StalkerMockups() {
  const [activeScreen, setActiveScreen] = useState("dashboard");
  const ActiveComponent = componentMap[activeScreen];

  return (
    <div style={{ background: T.surface, minHeight: "100vh", fontFamily: fontBody, color: T.text }}>
      <style>{globalCSS}</style>

      <header style={{ background: T.surfaceRaised, borderBottom: `1px solid ${T.surfaceBorder}`, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, color: T.textHeading, letterSpacing: "0.06em" }}>STALKER</span>
            <nav style={{ display: "flex", gap: 2 }}>
              {screens.map((s) => (
                <button key={s.id} onClick={() => setActiveScreen(s.id)} style={{
                  padding: "6px 14px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: fontBody, transition: "all 0.15s",
                  background: activeScreen === s.id ? T.interactive : "transparent",
                  color: activeScreen === s.id ? T.textHeading : T.textMuted,
                }}>{s.label}</button>
              ))}
            </nav>
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.textMuted }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 80px" }}>
        {activeScreen === "advisor" ? (
          <Card style={{ overflow: "hidden", maxWidth: 480, margin: "0 auto" }}>
            <ActiveComponent />
          </Card>
        ) : (
          <ActiveComponent />
        )}
      </main>

      {activeScreen !== "empty" && activeScreen !== "advisor" && (
        <footer style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10,
          background: T.surfaceRaised, borderTop: `1px solid ${T.surfaceBorder}`,
          height: 36, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: fontBody, fontSize: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, color: T.textSubtle }}>
            <span><span style={{ color: T.textMuted }}>8</span> instruments</span>
            <span style={{ color: T.surfaceBorder }}>&middot;</span>
            <span>Polling every <span style={{ color: T.textMuted }}>30m</span> during market hours</span>
            <span style={{ color: T.surfaceBorder }}>&middot;</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: T.textMuted }}>183</span> / 250 FMP calls
              <span style={{ display: "inline-flex", width: 48, height: 4, background: T.surfaceOverlay, borderRadius: 9999, overflow: "hidden" }}>
                <span style={{ width: "73%", height: "100%", background: T.gainFg, borderRadius: 9999 }} />
              </span>
            </span>
            <span style={{ color: T.surfaceBorder }}>&middot;</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.gainFg }} />
              All quotes &lt; 35 min
            </span>
          </div>
        </footer>
      )}

      {activeScreen !== "advisor" && (
        <button onClick={() => setActiveScreen("advisor")} style={{
          position: "fixed", bottom: 52, right: 24, zIndex: 30,
          width: 52, height: 52, borderRadius: "50%",
          background: T.interactive, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.2)",
          color: T.text, transition: "transform 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.background = T.interactiveHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = T.interactive; }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      )}
    </div>
  );
}
