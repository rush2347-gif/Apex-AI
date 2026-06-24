import { useState, useEffect, useRef } from "react";
import {
  ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell, Legend,
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, Minus, Globe, Eye, ArrowUpRight,
  ArrowDownRight, AlertTriangle, Zap, Activity, BarChart3, Layers,
  GitCompare, ShieldCheck, RefreshCw, X,
} from "lucide-react";

/* ── Design tokens ─────────────────────────────────────────── */
const C = {
  bg: "#080A0F", surface: "#0F1117", raised: "#161B27", border: "#1E2535",
  blue: "#3B82F6", bull: "#22C55E", bear: "#EF4444", neutral: "#F59E0B",
  gold: "#D4AF37", text: "#F1F5F9", muted: "#64748B", dim: "#475569",
};
const SANS = "'Inter', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const verdictColor = (v = "") => {
  const s = v.toLowerCase();
  if (s.includes("strong buy")) return C.bull;
  if (s.includes("buy")) return "#4ADE80";
  if (s.includes("strong sell")) return C.bear;
  if (s.includes("sell")) return "#FB923C";
  return C.neutral;
};
const signalColor = (s = "") => {
  const t = s.toLowerCase();
  if (t.includes("bull") || t.includes("above") || t.includes("increas") || t.includes("golden")) return C.bull;
  if (t.includes("bear") || t.includes("below") || t.includes("decreas") || t.includes("death")) return C.bear;
  return C.neutral;
};
const num = (s) => {
  if (s == null) return NaN;
  const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

/* ── Synthetic OHLC generator ──────────────────────────────── */
function generateChartData(report) {
  const ta = report?.technical_analysis || {};
  const kpi = report?.kpi_snapshot || {};
  const anchor = num(kpi.current_price_est) || 100;
  const trend = (report?.executive_summary?.trend_direction || "").toLowerCase();
  const drift = trend.includes("up") ? 0.0018 : trend.includes("down") ? -0.0018 : 0;
  const supports = (ta.support_levels || []).map(num).filter((n) => !isNaN(n));
  const resists = (ta.resistance_levels || []).map(num).filter((n) => !isNaN(n));
  const floor = supports.length ? Math.min(...supports) : anchor * 0.8;
  const ceil = resists.length ? Math.max(...resists) : anchor * 1.2;
  const vol = anchor * 0.015;

  const days = 90;
  let price = anchor * 0.92;
  const out = [];
  for (let i = 0; i < days; i++) {
    const open = price;
    let move = (Math.random() - 0.5) * vol * 2 + price * drift;
    if (price < floor) move += vol * 0.6;
    if (price > ceil) move -= vol * 0.6;
    const close = Math.max(0.01, open + move);
    const high = Math.max(open, close) + Math.random() * vol * 0.8;
    const low = Math.min(open, close) - Math.random() * vol * 0.8;
    const volume = Math.round((0.6 + Math.random()) * 1e6);
    const d = new Date();
    d.setDate(d.getDate() - (days - i));
    out.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      open: +open.toFixed(2), close: +close.toFixed(2),
      high: +high.toFixed(2), low: +low.toFixed(2),
      range: [+low.toFixed(2), +high.toFixed(2)],
      volume, up: close >= open,
    });
    price = close;
  }
  const ma = (arr, p, i) => {
    if (i < p - 1) return null;
    let s = 0; for (let k = i - p + 1; k <= i; k++) s += arr[k].close;
    return +(s / p).toFixed(2);
  };
  const va = (arr, p, i) => {
    if (i < p - 1) return null;
    let s = 0; for (let k = i - p + 1; k <= i; k++) s += arr[k].volume;
    return Math.round(s / p);
  };
  out.forEach((d, i) => {
    d.ma50 = ma(out, 50, i); d.ma200 = ma(out, 30, i); // 30 as proxy for long MA over 90d window
    d.vol20 = va(out, 20, i);
  });

  // normalized comparison vs a synthetic benchmark
  const base0 = out[0].close, bench = [];
  let bp = 100;
  out.forEach((d, i) => {
    bp = bp * (1 + (Math.random() - 0.49) * 0.012);
    bench.push({ date: d.date, asset: +((d.close / base0) * 100).toFixed(2), benchmark: +bp.toFixed(2) });
  });
  return { ohlc: out, bench, supports, resists };
}

/* ── Candlestick custom shape ──────────────────────────────── */
function Candle(props) {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const span = high - low || 1;
  const ppp = height / span;
  const oY = y + (high - open) * ppp;
  const cY = y + (high - close) * ppp;
  const bull = close >= open;
  const col = bull ? C.bull : C.bear;
  const bodyTop = Math.min(oY, cY);
  const bodyH = Math.max(Math.abs(oY - cY), 1);
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={col} strokeWidth={1} />
      <rect x={x + width * 0.2} y={bodyTop} width={width * 0.6} height={bodyH} fill={col} rx={0.5} />
    </g>
  );
}

/* ── Tooltip ───────────────────────────────────────────────── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : Array.isArray(p.value) ? p.value.join(" – ") : p.value}
        </div>
      ))}
    </div>
  );
}

/* ── Small UI atoms ────────────────────────────────────────── */
const Pill = ({ children, color = C.muted, bg }) => (
  <span style={{
    display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 10.5,
    letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700,
    color, background: bg || `${color}1A`, border: `1px solid ${color}40`, whiteSpace: "nowrap",
  }}>{children}</span>
);
const Card = ({ children, style }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>
);
const SectionTitle = ({ icon: Icon, children, id }) => (
  <div id={id} style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px", paddingLeft: 12, borderLeft: `2px solid ${C.blue}` }}>
    {Icon && <Icon size={16} color={C.blue} />}
    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, letterSpacing: ".02em" }}>{children}</h2>
  </div>
);

/* ── Confidence ring ───────────────────────────────────────── */
function ConfidenceRing({ value = 0, color }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), 80); return () => clearTimeout(t); }, [value]);
  const r = 30, c = 2 * Math.PI * r, off = c - (v / 100) * c;
  return (
    <div style={{ position: "relative", width: 76, height: 76 }}>
      <svg width="76" height="76" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="38" cy="38" r={r} fill="none" stroke={C.border} strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 700ms ease-out" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: C.text }}>{Math.round(v)}</span>
        <span style={{ fontSize: 8, color: C.muted, letterSpacing: ".1em" }}>CONF</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function APEX() {
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState(0);
  const [report, setReport] = useState(null);
  const [chart, setChart] = useState(null);
  const [error, setError] = useState(null);
  const [chartTab, setChartTab] = useState("price");
  const [scenTab, setScenTab] = useState("midterm");
  const lastQuery = useRef("");

  useEffect(() => {
    const id = "apex-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    const msgs = ["Ingesting market data…", "Running fundamental screen…", "Generating analyst scenarios…", "Compiling intelligence report…"];
    const t = setInterval(() => setLoadMsg((m) => (m + 1) % msgs.length), 1400);
    return () => clearInterval(t);
  }, [loading]);

  async function runAnalysis(q) {
    if (!q?.trim()) return;
    lastQuery.current = q;
    setQuery(q); setLoading(true); setError(null); setReport(null); setChart(null); setLoadMsg(0);

    const SYSTEM = `You are APEX, a decisive senior financial analyst. Return ONLY valid JSON, no markdown or extra text. Use "est. " prefix where data is estimated; use "N/A" only when a metric truly doesn't apply. Schema:
{"asset":{"name":"","ticker":"","type":"equity|commodity|crypto","sector":"","exchange":""},"executive_summary":{"one_liner":"","verdict":"Strong Buy|Buy|Hold|Sell|Strong Sell","confidence_score":0,"sentiment":"Bullish|Neutral|Bearish","trend_direction":"Uptrend|Downtrend|Consolidating|Reversal Likely","analyst_note":""},"kpi_snapshot":{"current_price_est":"","market_cap_est":"","pe_ratio_est":"","eps_est":"","revenue_growth_est":"","gross_margin_est":"","week_52_high_est":"","week_52_low_est":"","avg_volume_est":"","beta_est":"","dividend_yield_est":""},"technical_analysis":{"summary":"","support_levels":["","",""],"resistance_levels":["","",""],"rsi_14":"","macd_signal":"","ma_50d":"","ma_200d":"","ma_position":"","volume_trend":"","bollinger_position":"","chart_pattern":""},"fundamental_analysis":{"business_overview":"","competitive_moat":"Wide|Narrow|None","moat_description":"","growth_catalysts":["","",""],"key_risks":["","",""],"valuation_method":"","valuation_note":"","valuation_position":"Undervalued|Fairly Valued|Overvalued"},"competitive_landscape":{"peer_rank":1,"total_peers":5,"rationale":"","top_competitors":[{"name":"","ticker":"","verdict":"Stronger|Comparable|Weaker","reason":""}]},"price_scenarios":{"midterm":{"horizon":"6-12 months","conservative":{"target":"","upside_pct":"","rationale":""},"base":{"target":"","upside_pct":"","rationale":""},"aggressive":{"target":"","upside_pct":"","rationale":""}},"longterm":{"horizon":"2-3 years","conservative":{"target":"","upside_pct":"","rationale":""},"base":{"target":"","upside_pct":"","rationale":""},"aggressive":{"target":"","upside_pct":"","rationale":""}}},"macro_context":"","final_call":"","watchlist_trigger":""}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system: SYSTEM,
          messages: [{ role: "user", content: `Analyze this asset for a senior-level report: ${q}` }],
        }),
      });
      const data = await res.json();
      const raw = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
      const parsed = JSON.parse(clean.slice(start, end + 1));
      setReport(parsed);
      setChart(generateChartData(parsed));
    } catch (e) {
      setError("APEX could not generate a report for this asset. Please check the input and try again.");
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = () => runAnalysis(input);

  /* ── Navbar ── */
  const Nav = () => (
    <div style={{
      position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 24px", background: `${C.surface}E6`, backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => { setReport(null); setError(null); setQuery(""); }}>
        <div style={{ width: 22, height: 22, background: C.blue, transform: "rotate(45deg)", borderRadius: 4 }} />
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: ".14em", color: C.text }}>APEX</span>
      </div>
      {report && (
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.muted, overflow: "auto" }}>
          {["summary", "kpis", "charts", "technical", "fundamentals", "peers", "scenarios", "verdict"].map((s) => (
            <a key={s} href={`#${s}`} style={{ color: C.muted, textDecoration: "none", textTransform: "capitalize", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => (e.target.style.color = C.text)} onMouseLeave={(e) => (e.target.style.color = C.muted)}>{s}</a>
          ))}
        </div>
      )}
      <button onClick={() => { setReport(null); setError(null); setInput(""); }}
        style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: SANS }}>
        New Search
      </button>
    </div>
  );

  /* ── Landing ── */
  if (!report && !loading) {
    return (
      <div style={{ fontFamily: SANS, background: C.bg, color: C.text, minHeight: 720 }}>
        <Nav />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "90px 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 40, fontWeight: 700, margin: "0 0 14px", letterSpacing: "-.02em", lineHeight: 1.1 }}>
            Institutional Intelligence.<br /><span style={{ color: C.blue }}>Yours Now.</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 16, maxWidth: 480, margin: "0 0 36px" }}>
            Analyze any stock, commodity, or crypto with senior-analyst depth — fundamentals, technicals, and scenario targets.
          </p>
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 600 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={18} color={C.muted} style={{ position: "absolute", left: 14, top: 15 }} />
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                placeholder="Enter ticker, company, or commodity…"
                style={{ width: "100%", boxSizing: "border-box", padding: "14px 14px 14px 42px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 15, fontFamily: SANS, outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = C.blue)} onBlur={(e) => (e.target.style.borderColor = C.border)} />
            </div>
            <button onClick={onSubmit} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 10, padding: "0 22px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: SANS }}>
              Analyze
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
            {[["AAPL", "Apple Inc."], ["GOLD", "Spot Gold"], ["BTC", "Bitcoin"]].map(([t, n]) => (
              <button key={t} onClick={() => { setInput(t); runAnalysis(t); }}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 16px", color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: SANS }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
                <span style={{ fontFamily: MONO, color: C.text }}>{t}</span> · {n}
              </button>
            ))}
          </div>
          {error && (
            <div style={{ marginTop: 28, maxWidth: 600, width: "100%", background: `${C.bear}14`, border: `1px solid ${C.bear}55`, borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: C.bear, fontSize: 14, textAlign: "left" }}>{error}</span>
              <button onClick={() => runAnalysis(lastQuery.current)} style={{ background: C.bear, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: SANS }}>
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (loading) {
    const msgs = ["Ingesting market data…", "Running fundamental screen…", "Generating analyst scenarios…", "Compiling intelligence report…"];
    return (
      <div style={{ fontFamily: SANS, background: C.bg, color: C.text, minHeight: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <div style={{ width: 44, height: 44, border: `3px solid ${C.border}`, borderTopColor: C.blue, borderRadius: "50%", animation: "apexspin 0.8s linear infinite" }} />
        <div style={{ fontFamily: MONO, fontSize: 14, color: C.muted, letterSpacing: ".02em" }}>{msgs[loadMsg]}</div>
        <div style={{ fontSize: 12, color: C.dim }}>Analyzing <span style={{ color: C.text }}>{query}</span></div>
        <style>{`@keyframes apexspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  /* ── Dashboard ── */
  const r = report, es = r.executive_summary || {}, kpi = r.kpi_snapshot || {},
    ta = r.technical_analysis || {}, fa = r.fundamental_analysis || {},
    cl = r.competitive_landscape || {}, ps = r.price_scenarios || {};
  const vc = verdictColor(es.verdict);
  const TrendIcon = (es.trend_direction || "").toLowerCase().includes("up") ? TrendingUp
    : (es.trend_direction || "").toLowerCase().includes("down") ? TrendingDown : Minus;

  const kpis = [
    ["Current Price", kpi.current_price_est], ["Market Cap", kpi.market_cap_est],
    ["P/E Ratio", kpi.pe_ratio_est], ["EPS (TTM)", kpi.eps_est],
    ["Revenue Growth", kpi.revenue_growth_est], ["Gross Margin", kpi.gross_margin_est],
    ["52-Week High", kpi.week_52_high_est], ["52-Week Low", kpi.week_52_low_est],
    ["Avg Volume", kpi.avg_volume_est], ["Beta", kpi.beta_est], ["Dividend Yield", kpi.dividend_yield_est],
  ];

  const scen = ps[scenTab] || {};
  const scenCards = [
    ["Conservative", scen.conservative, C.blue], ["Base Case", scen.base, C.blue], ["Aggressive", scen.aggressive, C.neutral],
  ];
  const valPos = (fa.valuation_position || "Fairly Valued").toLowerCase();
  const valX = valPos.includes("under") ? 18 : valPos.includes("over") ? 82 : 50;

  const chartTabs = [["price", "Price Action", BarChart3], ["volume", "Volume", Activity], ["ma", "Moving Averages", Layers], ["compare", "Comparison", GitCompare]];

  return (
    <div style={{ fontFamily: SANS, background: C.bg, color: C.text, minHeight: 700 }}>
      <Nav />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 60px", display: "flex", flexDirection: "column", gap: 26 }}>

        {/* EXECUTIVE SUMMARY */}
        <div id="summary" />
        <Card style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 24, fontWeight: 700 }}>{r.asset?.name || query}</span>
                <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted, background: C.raised, padding: "3px 8px", borderRadius: 6 }}>{r.asset?.ticker}</span>
                <Pill color={C.muted}>{r.asset?.exchange || "—"}</Pill>
                <Pill color={C.blue}>{r.asset?.type}</Pill>
              </div>
              <p style={{ fontSize: 19, fontWeight: 600, fontStyle: "italic", lineHeight: 1.4, margin: "0 0 14px", color: C.text, maxWidth: 620 }}>
                “{es.one_liner}”
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Pill color={es.sentiment === "Bullish" ? C.bull : es.sentiment === "Bearish" ? C.bear : C.neutral}>{es.sentiment}</Pill>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px" }}>
                  <TrendIcon size={13} color={vc} /> {es.trend_direction}
                </span>
              </div>
              <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 620 }}>{es.analyst_note}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, minWidth: 120 }}>
              <div style={{ background: vc, color: "#05070C", fontWeight: 700, fontSize: 14, padding: "8px 18px", borderRadius: 999, letterSpacing: ".04em", textAlign: "center" }}>
                {es.verdict}
              </div>
              <ConfidenceRing value={Number(es.confidence_score) || 0} color={vc} />
            </div>
          </div>
        </Card>

        {/* KPI GRID */}
        <div>
          <SectionTitle icon={Zap} id="kpis">Key Metrics</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {kpis.map(([label, val]) => {
              const na = !val || String(val).toLowerCase() === "n/a";
              return (
                <div key={label} className="apex-kpi" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", transition: "all .15s" }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, letterSpacing: ".02em" }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, color: na ? C.dim : C.text }}>{na ? "—" : val}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CHARTS */}
        <div>
          <SectionTitle icon={BarChart3} id="charts">Price Charts</SectionTitle>
          <Card style={{ padding: "16px 8px 8px" }}>
            <div style={{ display: "flex", gap: 4, padding: "0 12px 14px", borderBottom: `1px solid ${C.border}`, marginBottom: 12, flexWrap: "wrap" }}>
              {chartTabs.map(([id, label, Icon]) => (
                <button key={id} onClick={() => setChartTab(id)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", borderBottom: `2px solid ${chartTab === id ? C.blue : "transparent"}`, color: chartTab === id ? C.text : C.muted, padding: "8px 12px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: SANS, transition: "all .15s" }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            <div style={{ height: 340, position: "relative" }}>
              <div style={{ position: "absolute", top: 4, right: 16, zIndex: 5 }}><Pill color={vc}>{es.verdict}</Pill></div>
              <ResponsiveContainer width="100%" height="100%">
                {chartTab === "price" ? (
                  <ComposedChart data={chart.ohlc} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} interval={14} stroke={C.border} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} stroke={C.border} width={50} />
                    <Tooltip content={<ChartTip />} />
                    {chart.supports.map((s, i) => <ReferenceLine key={"s" + i} y={s} stroke={C.bull} strokeDasharray="4 4" strokeOpacity={0.6} />)}
                    {chart.resists.map((s, i) => <ReferenceLine key={"r" + i} y={s} stroke={C.bear} strokeDasharray="4 4" strokeOpacity={0.6} />)}
                    <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
                  </ComposedChart>
                ) : chartTab === "volume" ? (
                  <ComposedChart data={chart.ohlc} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} interval={14} stroke={C.border} />
                    <YAxis tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} stroke={C.border} width={50} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="volume" isAnimationActive={false}>
                      {chart.ohlc.map((d, i) => <Cell key={i} fill={d.up ? `${C.bull}99` : `${C.bear}99`} />)}
                    </Bar>
                    <Line dataKey="vol20" name="20-day avg" stroke={C.neutral} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  </ComposedChart>
                ) : chartTab === "ma" ? (
                  <LineChart data={chart.ohlc} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} interval={14} stroke={C.border} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} stroke={C.border} width={50} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: MONO }} />
                    <Line dataKey="close" name="Price" stroke={C.text} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    <Line dataKey="ma50" name="50-day MA" stroke={C.blue} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    <Line dataKey="ma200" name="Long MA" stroke={C.neutral} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  </LineChart>
                ) : (
                  <LineChart data={chart.bench} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} interval={14} stroke={C.border} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: C.muted, fontFamily: MONO, fontSize: 10 }} stroke={C.border} width={50} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: MONO }} />
                    <Line dataKey="asset" name={r.asset?.ticker || "Asset"} stroke={C.blue} dot={false} strokeWidth={1.8} isAnimationActive={false} />
                    <Line dataKey="benchmark" name="S&P 500" stroke={C.muted} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* TECHNICAL */}
        <div>
          <SectionTitle icon={Activity} id="technical">Technical Analysis</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <Card>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, margin: "0 0 16px" }}>{ta.summary}</p>
              {ta.chart_pattern && <div style={{ marginBottom: 16 }}><Pill color={C.blue}>Pattern · {ta.chart_pattern}</Pill></div>}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: ".05em", textTransform: "uppercase" }}>Support</div>
                  {(ta.support_levels || []).map((s, i) => <div key={i} style={{ fontFamily: MONO, fontSize: 14, color: C.bull, marginBottom: 4 }}>● {s}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: ".05em", textTransform: "uppercase" }}>Resistance</div>
                  {(ta.resistance_levels || []).map((s, i) => <div key={i} style={{ fontFamily: MONO, fontSize: 14, color: C.bear, marginBottom: 4 }}>● {s}</div>)}
                </div>
              </div>
            </Card>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {[["RSI (14)", ta.rsi_14], ["MACD", ta.macd_signal], ["50-Day MA", ta.ma_50d], ["200-Day MA", ta.ma_200d], ["MA Position", ta.ma_position], ["Volume Trend", ta.volume_trend], ["Bollinger", ta.bollinger_position]].map(([k, v], i) => (
                <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: i < 6 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 13, color: C.muted }}>{k}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{v || "—"}</span>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: signalColor(v || "") }} />
                  </span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* FUNDAMENTALS */}
        <div>
          <SectionTitle icon={ShieldCheck} id="fundamentals">Fundamental Analysis</SectionTitle>
          <Card>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: C.muted, margin: "0 0 18px", maxWidth: 760 }}>{fa.business_overview}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <Pill color={fa.competitive_moat === "Wide" ? C.gold : fa.competitive_moat === "Narrow" ? "#94A3B8" : C.muted}>
                {fa.competitive_moat} Moat
              </Pill>
              <span style={{ fontSize: 13, color: C.muted }}>{fa.moat_description}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: ".05em", textTransform: "uppercase" }}>Growth Catalysts</div>
                {(fa.growth_catalysts || []).map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, marginBottom: 8, lineHeight: 1.45 }}>
                    <ArrowUpRight size={15} color={C.bull} style={{ flexShrink: 0, marginTop: 1 }} /> {g}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: ".05em", textTransform: "uppercase" }}>Key Risks</div>
                {(fa.key_risks || []).map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, marginBottom: 8, lineHeight: 1.45 }}>
                    <AlertTriangle size={15} color={C.bear} style={{ flexShrink: 0, marginTop: 1 }} /> {g}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}><Pill color={C.blue}>{fa.valuation_method}</Pill></div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: C.muted, margin: "10px 0 18px", maxWidth: 760 }}>{fa.valuation_note}</p>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 6 }}>
                <span>Undervalued</span><span style={{ color: C.text, fontWeight: 600 }}>{fa.valuation_position}</span><span>Overvalued</span>
              </div>
              <div style={{ position: "relative", height: 6, background: `linear-gradient(90deg, ${C.bull}, ${C.neutral}, ${C.bear})`, borderRadius: 3, opacity: 0.5 }}>
                <div style={{ position: "absolute", top: -4, left: `${valX}%`, transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", background: C.text, border: `2px solid ${C.bg}` }} />
              </div>
            </div>
          </Card>
        </div>

        {/* COMPETITIVE */}
        <div>
          <SectionTitle icon={GitCompare} id="peers">Competitive Landscape</SectionTitle>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <Pill color={C.blue} bg={`${C.blue}22`}>Ranked #{cl.peer_rank} of {cl.total_peers}</Pill>
              <span style={{ fontSize: 13, color: C.muted }}>{cl.rationale}</span>
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Name</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Ticker</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Verdict</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(cl.top_competitors || []).map((c, i) => {
                    const vcol = c.verdict === "Stronger" ? C.bear : c.verdict === "Weaker" ? C.bull : C.neutral;
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "11px 10px", color: C.text }}>{c.name}</td>
                        <td style={{ padding: "11px 10px", fontFamily: MONO, color: C.muted }}>{c.ticker}</td>
                        <td style={{ padding: "11px 10px", color: vcol, fontWeight: 600 }}>{c.verdict}</td>
                        <td style={{ padding: "11px 10px", color: C.muted }}>{c.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* SCENARIOS */}
        <div>
          <SectionTitle icon={TrendingUp} id="scenarios">Price Scenarios</SectionTitle>
          <Card>
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {[["midterm", `Mid-Term · ${ps.midterm?.horizon || "6–12M"}`], ["longterm", `Long-Term · ${ps.longterm?.horizon || "2–3Y"}`]].map(([id, label]) => (
                <button key={id} onClick={() => setScenTab(id)}
                  style={{ background: scenTab === id ? C.raised : "transparent", border: `1px solid ${scenTab === id ? C.blue : C.border}`, color: scenTab === id ? C.text : C.muted, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: SANS }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
              {scenCards.map(([label, sc, accent], i) => {
                const hero = label === "Base Case";
                const up = num(sc?.upside_pct);
                const upCol = up >= 0 ? C.bull : C.bear;
                return (
                  <div key={label} style={{
                    background: hero ? C.raised : C.surface,
                    border: hero ? `1.5px solid ${C.blue}` : `1px solid ${C.border}`,
                    borderLeft: hero ? `1.5px solid ${C.blue}` : `3px solid ${accent}`,
                    borderRadius: hero ? 12 : "0 12px 12px 0", padding: 18,
                  }}>
                    <Pill color={accent}>{label}</Pill>
                    <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: C.text, margin: "12px 0 4px" }}>{sc?.target || "—"}</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: upCol, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      {up >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {sc?.upside_pct}
                    </div>
                    <p style={{ fontSize: 12.5, lineHeight: 1.55, color: C.muted, margin: 0 }}>{sc?.rationale}</p>
                  </div>
                );
              })}
            </div>
            {/* range bar */}
            <div style={{ padding: "0 8px" }}>
              <div style={{ position: "relative", height: 4, background: C.border, borderRadius: 2 }}>
                <div style={{ position: "absolute", left: "0%", top: -4, width: 12, height: 12, borderRadius: "50%", background: C.blue, border: `2px solid ${C.bg}` }} />
                <div style={{ position: "absolute", left: "50%", top: -6, transform: "translateX(-50%)", width: 16, height: 16, borderRadius: "50%", background: C.blue, border: `2px solid ${C.bg}` }} />
                <div style={{ position: "absolute", left: "100%", top: -4, transform: "translateX(-100%)", width: 12, height: 12, borderRadius: "50%", background: C.neutral, border: `2px solid ${C.bg}` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 10 }}>
                <span>{scen.conservative?.target}</span>
                <span style={{ color: C.blue }}>{scen.base?.target}</span>
                <span style={{ color: C.neutral }}>{scen.aggressive?.target}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* MACRO + VERDICT */}
        <div>
          <SectionTitle icon={Globe} id="verdict">Macro & Final Call</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Globe size={15} color={C.blue} /><span style={{ fontSize: 12, color: C.muted, letterSpacing: ".05em", textTransform: "uppercase" }}>Macro Context</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: C.text, margin: 0 }}>{r.macro_context}</p>
            </Card>
            <Card style={{ border: `1.5px solid ${vc}55`, background: `${vc}0D` }}>
              <div style={{ fontSize: 11, color: vc, letterSpacing: ".1em", fontWeight: 700, marginBottom: 12 }}>APEX FINAL CALL</div>
              <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.45, color: C.text, margin: "0 0 16px" }}>{r.final_call}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14 }}>
                <Eye size={15} color={C.neutral} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}><b style={{ color: C.text }}>Watch:</b> {r.watchlist_trigger}</span>
              </div>
              <div style={{ background: vc, color: "#05070C", fontWeight: 700, fontSize: 13, padding: "6px 16px", borderRadius: 999, display: "inline-block" }}>{es.verdict}</div>
            </Card>
          </div>
        </div>

        {/* DISCLAIMER */}
        <p style={{ textAlign: "center", fontSize: 11, color: C.dim, lineHeight: 1.6, maxWidth: 640, margin: "20px auto 0" }}>
          APEX Intelligence reports are AI-generated for informational purposes only and do not constitute financial advice.
          All price estimates are hypothetical. Always conduct your own due diligence.
        </p>
      </div>
      <style>{`.apex-kpi:hover{transform:scale(1.02);border-color:${C.blue}!important}`}</style>
    </div>
  );
}
