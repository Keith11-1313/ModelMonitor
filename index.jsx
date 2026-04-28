const { useState, useEffect, useCallback } = React;

// ── DATA is fetched from /public/models.json at runtime ──
// Add new models there; this file does not need to change.

const FALLBACK_MODELS = [
  {
    id: 1, name: "DeepSeek V4", company: "DeepSeek", date: "2026-04-24",
    week: 4, color: "#0f62fe",
    tags: ["Open Weights", "1.6T Params"],
    license: "Open Weights",
    summary: "1.6T parameters, 1M context window. Costs a fraction of GPT-5.5.",
    highlights: ["1.6T parameters", "1M token context", "Fraction of GPT-5.5 cost"],
  },
  {
    id: 2, name: "GPT-5.5", company: "OpenAI", date: "2026-04-23",
    week: 4, color: "#0f62fe",
    tags: ["Proprietary", "Agentic"],
    license: "Proprietary",
    summary: "Smartest OpenAI model yet. Stronger coding and agentic workflows at same speed as 5.4.",
    highlights: ["Strongest OpenAI model", "Improved agentic workflows", "Same speed as GPT-5.4"],
  },
  {
    id: 3, name: "Qwen3.6-27B", company: "Alibaba", date: "2026-04-22",
    week: 4, color: "#0f62fe",
    tags: ["Open Source"],
    license: "Open Source",
    summary: "Open source mid-size coding model. Solid performance for its parameter count.",
    highlights: ["27B parameters", "Open source", "Strong coding focus"],
  },
  {
    id: 4, name: "Kimi K2.6", company: "Moonshot AI", date: "2026-04-20",
    week: 3, color: "#0f62fe",
    tags: ["Open Weights", "MoE", "Multi-agent"],
    license: "Open Weights",
    summary: "1T open-weight MoE model. 300 parallel sub-agents, capable of running 12+ hours nonstop.",
    highlights: ["1T parameter MoE", "300 parallel sub-agents", "12+ hour continuous runs"],
  },
  {
    id: 5, name: "Qwen3.6-Max-Preview", company: "Alibaba", date: "2026-04-20",
    week: 3, color: "#0f62fe",
    tags: ["Proprietary", "Flagship"],
    license: "Proprietary",
    summary: "Proprietary flagship. Claimed top scores on 6 major coding benchmarks.",
    highlights: ["Proprietary flagship tier", "Top 6 coding benchmarks", "Max-tier preview"],
  },
  {
    id: 6, name: "Claude Opus 4.7", company: "Anthropic", date: "2026-04-16",
    week: 3, color: "#0f62fe",
    tags: ["Proprietary", "Reasoning"],
    license: "Proprietary",
    summary: "Biggest upgrade for complex reasoning and long-running agentic tasks.",
    highlights: ["Complex reasoning upgrade", "Long-running agent work", "Anthropic flagship"],
  },
  {
    id: 7, name: "Qwen3.6-35B-A3B", company: "Alibaba", date: "2026-04-16",
    week: 3, color: "#0f62fe",
    tags: ["Open Source", "Apache 2.0"],
    license: "Apache 2.0",
    summary: "Open source release under Apache 2.0 license. 35B total, 3B active parameters.",
    highlights: ["35B total / 3B active params", "Apache 2.0", "Open source"],
  },
  {
    id: 8, name: "Llama 4", company: "Meta", date: "2026-04-08",
    week: 2, color: "#0f62fe",
    tags: ["Open Weights", "10M Context"],
    license: "Open Weights",
    summary: "Open weights. Scout model ships with 10M token context window.",
    highlights: ["10M token context", "Scout model variant", "Open weights"],
  },
  {
    id: 9, name: "GLM-5.1", company: "Zhipu AI", date: "2026-04-07",
    week: 2, color: "#0f62fe",
    tags: ["MIT License"],
    license: "MIT",
    summary: "MIT licensed. Outperformed GPT-5.4 and Opus 4.6 on SWE-bench Pro.",
    highlights: ["MIT license", "Beats GPT-5.4 on SWE-bench Pro", "Beats Opus 4.6 on SWE-bench Pro"],
  },
  {
    id: 10, name: "Claude Mythos Preview", company: "Anthropic", date: "2026-04-07",
    week: 2, color: "#0f62fe",
    tags: ["Gated", "ASL-4"],
    license: "Gated",
    summary: "Gated to 50 organizations. Triggered Anthropic ASL-4 safety protocol.",
    highlights: ["Limited to 50 orgs", "ASL-4 safety triggered", "Preview access only"],
  },
  {
    id: 11, name: "Gemma 4 31B", company: "Google", date: "2026-04-02",
    week: 1, color: "#0f62fe",
    tags: ["Open Source"],
    license: "Open Source",
    summary: "Open source. Outperforms models 20x its size in benchmarks.",
    highlights: ["31B parameters", "Beats models 20x larger", "Open source"],
  },
];

// ── IBM Carbon CDS token map (white theme) ──
const CDS = {
  background:       "#ffffff",
  layer01:          "#f4f4f4",
  layer02:          "#e0e0e0",
  textPrimary:      "#161616",
  textSecondary:    "#525252",
  textPlaceholder:  "#6f6f6f",
  borderSubtle:     "#c6c6c6",
  borderStrong:     "#8d8d8d",
  interactive:      "#0f62fe",
  interactiveHover: "#0353e9",
  interactiveActive:"#002d9c",
  linkPrimary:      "#0f62fe",
  linkHover:        "#0043ce",
  focusRing:        "#0f62fe",
  supportError:     "#da1e28",
  supportSuccess:   "#24a148",
  supportWarning:   "#f1c21b",
  supportInfo:      "#0f62fe",
  navBg:            "#161616",
  navText:          "#c6c6c6",
  navTextHover:     "#ffffff",
  gray90:           "#262626",
  gray80:           "#393939",
  gray70:           "#525252",
  gray60:           "#6f6f6f",
  gray50:           "#8d8d8d",
  gray30:           "#c6c6c6",
  gray20:           "#e0e0e0",
  gray10:           "#f4f4f4",
  blue10:           "#edf5ff",
};

// License badge styles using Carbon semantic colors
const LICENSE_STYLE = {
  "Open Weights": { bg: CDS.blue10,              color: CDS.interactive,    border: "#a6c8ff" },
  "Open Source":  { bg: CDS.blue10,              color: CDS.interactive,    border: "#a6c8ff" },
  "MIT":          { bg: "#defbe6",               color: CDS.supportSuccess, border: "#a7f0ba" },
  "Apache 2.0":   { bg: "#defbe6",               color: CDS.supportSuccess, border: "#a7f0ba" },
  "Proprietary":  { bg: "#fff1f1",               color: CDS.supportError,   border: "#ffd7d9" },
  "Gated":        { bg: "#fff8e1",               color: "#b28600",          border: "#ffe082" },
};

// Company accent (used only for bar charts & decorative dots — single blue palette)
const COMPANY_COLORS = {
  "DeepSeek":   CDS.interactive,
  "OpenAI":     "#0043ce",
  "Alibaba":    "#002d9c",
  "Moonshot AI":"#4589ff",
  "Anthropic":  "#78a9ff",
  "Meta":       "#0f62fe",
  "Zhipu AI":   "#0353e9",
  "Google":     "#0043ce",
};

const WEEKS = [
  { id: "all", label: "All Releases", range: "Apr 1 – 24" },
  { id: 4, label: "Week 4", range: "Apr 21 – 27" },
  { id: 3, label: "Week 3", range: "Apr 14 – 20" },
  { id: 2, label: "Week 2", range: "Apr 7 – 13" },
  { id: 1, label: "Week 1", range: "Apr 1 – 6" },
];

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatDateShort(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function App() {
  const [activeWeek, setActiveWeek] = useState("all");
  const [activeView, setActiveView] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [loadState, setLoadState] = useState("idle");

  const closeModal = useCallback(() => setSelected(null), []);

  // Fetch models.json on mount
  useEffect(() => {
    setLoadState("loading");
    fetch("./public/models.json")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load models.json");
        return r.json();
      })
      .then((data) => {
        setModels(data);
        setLoadState("idle");
      })
      .catch(() => {
        setLoadState("error");
      });
  }, []);

  // Inject global CSS with IBM Plex fonts, Carbon reset, and micro-animations
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --cds-background: ${CDS.background};
        --cds-layer-01: ${CDS.layer01};
        --cds-layer-02: ${CDS.layer02};
        --cds-text-primary: ${CDS.textPrimary};
        --cds-text-secondary: ${CDS.textSecondary};
        --cds-border-subtle: ${CDS.borderSubtle};
        --cds-interactive: ${CDS.interactive};
        --cds-button-primary: ${CDS.interactive};
        --cds-button-primary-hover: ${CDS.interactiveHover};
        --cds-button-primary-active: ${CDS.interactiveActive};
        --cds-link-primary: ${CDS.linkPrimary};
        --cds-link-primary-hover: ${CDS.linkHover};
        --cds-focus: ${CDS.focusRing};
        --cds-support-error: ${CDS.supportError};
        --cds-support-success: ${CDS.supportSuccess};
        --cds-support-warning: ${CDS.supportWarning};
        --cds-support-info: ${CDS.supportInfo};
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
        background: var(--cds-background);
        color: var(--cds-text-primary);
        -webkit-font-smoothing: antialiased;
      }

      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: ${CDS.layer01}; }
      ::-webkit-scrollbar-thumb { background: ${CDS.borderSubtle}; }

      /* Tile hover — background shift only, no transform per Carbon */
      .cds-tile {
        transition: background-color 0.15s ease;
        cursor: pointer;
      }
      .cds-tile:hover { background-color: ${CDS.layer02} !important; }
      .cds-tile:focus { outline: 2px solid ${CDS.focusRing}; outline-offset: -2px; }

      /* Tab buttons */
      .cds-tab {
        transition: color 0.15s ease, border-bottom-color 0.15s ease, background-color 0.15s ease;
        touch-action: manipulation;
      }
      .cds-tab:hover { color: ${CDS.textPrimary} !important; background-color: ${CDS.layer01} !important; }

      /* View toggle buttons */
      .cds-view-btn {
        transition: color 0.15s ease, background-color 0.15s ease;
        touch-action: manipulation;
      }
      .cds-view-btn:hover { background-color: ${CDS.layer01} !important; }

      /* Arrow reveal on list rows */
      .cds-list-arrow {
        opacity: 0;
        transform: translateX(-4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        color: ${CDS.textSecondary};
        font-size: 18px;
        flex-shrink: 0;
      }
      .cds-tile:hover .cds-list-arrow {
        opacity: 1;
        transform: translateX(0);
      }

      /* Fade-up entry */
      .cds-fade-in { animation: cdsUp 0.3s ease both; }
      @keyframes cdsUp {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Modal entry */
      .cds-modal-enter { animation: cdsModal 0.2s ease both; }
      @keyframes cdsModal {
        from { opacity: 0; transform: scale(0.98) translateY(6px); }
        to   { opacity: 1; transform: scale(1)   translateY(0); }
      }

      /* Live pulse dot */
      .cds-pulse { animation: cdsPulse 2s ease-in-out infinite; }
      @keyframes cdsPulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(36,161,72,0.4); }
        50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(36,161,72,0); }
      }

      /* Bar grow */
      .cds-bar-fill { animation: cdsBar 0.6s ease both; }
      @keyframes cdsBar { from { width: 0% !important; } }

      /* Stat tile subtle hover */
      .cds-stat-tile {
        transition: background-color 0.15s ease;
      }
      .cds-stat-tile:hover { background-color: ${CDS.layer02} !important; }

      /* Close button */
      .cds-close-btn {
        transition: background-color 0.15s ease;
      }
      .cds-close-btn:hover { background-color: ${CDS.layer02} !important; }

      /* Responsive */
      @media (max-width: 672px) {
        .cds-stats-row { grid-template-columns: 1fr 1fr !important; }
        .cds-controls-row { flex-direction: column !important; align-items: stretch !important; }
        .cds-list-summary-col { display: none !important; }
        .cds-summary-grid { grid-template-columns: 1fr !important; }
        .cds-tab-row { flex-wrap: wrap !important; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Escape key to close modal
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeModal]);

  const filtered = activeWeek === "all" ? models : models.filter(m => m.week === activeWeek);
  const companyCount = [...new Set(models.map(m => m.company))].length;
  const openCount = models.filter(m => ["Open Weights", "Open Source", "MIT", "Apache 2.0"].includes(m.license)).length;
  const companySummary = Object.entries(
    models.reduce((acc, m) => { acc[m.company] = (acc[m.company] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]);

  // ── Inline style helpers ──
  const typo = {
    // Display 01: 60px, weight 300, lh 1.17
    display01: { fontSize: "clamp(32px,4.5vw,60px)", fontWeight: 300, lineHeight: 1.17, color: CDS.textPrimary },
    // Heading 04: 20px, weight 600, lh 1.40
    heading04: { fontSize: "20px", fontWeight: 600, lineHeight: 1.40, color: CDS.textPrimary },
    // Heading 05: 20px, weight 400, lh 1.40
    heading05: { fontSize: "20px", fontWeight: 400, lineHeight: 1.40, color: CDS.textPrimary },
    // Body Short 01: 14px, weight 400, lh 1.29, ls 0.16px
    bodyShort01: { fontSize: "14px", fontWeight: 400, lineHeight: 1.29, letterSpacing: "0.16px", color: CDS.textPrimary },
    // Body Short 02: 14px, weight 600, lh 1.29, ls 0.16px
    bodyShort02: { fontSize: "14px", fontWeight: 600, lineHeight: 1.29, letterSpacing: "0.16px", color: CDS.textPrimary },
    // Body Long 01: 16px, weight 400, lh 1.50
    bodyLong01: { fontSize: "16px", fontWeight: 400, lineHeight: 1.50, color: CDS.textSecondary },
    // Caption 01: 12px, weight 400, lh 1.33, ls 0.32px
    caption01: { fontSize: "12px", fontWeight: 400, lineHeight: 1.33, letterSpacing: "0.32px", color: CDS.textSecondary },
    // Code 01: Mono 14px, weight 400, lh 1.43, ls 0.16px
    code01: { fontFamily: "'IBM Plex Mono', Menlo, Courier, monospace", fontSize: "14px", fontWeight: 400, lineHeight: 1.43, letterSpacing: "0.16px" },
  };

  const STATS = [
    { value: models.length,             label: "Total Releases" },
    { value: companyCount,              label: "Companies" },
    { value: openCount,                 label: "Open Weights / Source" },
    { value: models.length - openCount, label: "Proprietary / Gated" },
    { value: [...new Set(models.map(m => m.week))].length, label: "Active Weeks" },
  ];

  // ── Load / Error notification bar (Carbon notification banner style) ──
  const LoadBanner = () => {
    if (loadState === "loading") return (
      <div style={{
        background: CDS.interactive, color: "#ffffff",
        padding: "8px 32px",
        ...typo.bodyShort01,
        letterSpacing: "0.16px",
      }}>
        Fetching latest models…
      </div>
    );
    if (loadState === "error") return (
      <div style={{
        background: CDS.supportError, color: "#ffffff",
        padding: "8px 32px",
        ...typo.bodyShort01,
      }}>
        ⚠ Could not load models.json — showing cached data.
      </div>
    );
    return null;
  };

  // ── Tag component (Carbon Tag / Label) ──
  const Tag = ({ children, style: extra }) => (
    <span style={{
      display: "inline-block",
      background: CDS.layer01,
      color: CDS.textSecondary,
      ...typo.caption01,
      padding: "2px 8px",
      borderRadius: "24px",
      border: `1px solid ${CDS.borderSubtle}`,
      ...extra,
    }}>
      {children}
    </span>
  );

  // ── License tag (color-coded Tag variant) ──
  const LicenseTag = ({ lic }) => {
    const st = LICENSE_STYLE[lic] || LICENSE_STYLE["Proprietary"];
    return (
      <span style={{
        display: "inline-block",
        background: st.bg,
        color: st.color,
        border: `1px solid ${st.border}`,
        ...typo.caption01,
        padding: "2px 8px",
        borderRadius: "24px",
        fontWeight: 600,
        flexShrink: 0,
        textTransform: "uppercase",
        letterSpacing: "0.32px",
      }}>
        {lic}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif", background: CDS.background, minHeight: "100vh", color: CDS.textPrimary }}>
      <LoadBanner />

      {/* ── NAV (Carbon masthead: Gray 100, 48px) ── */}
      <nav style={{
        background: CDS.navBg,
        height: "48px",
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* IBM 8-bar logo mark (simplified SVG) */}
          <svg width="22" height="22" viewBox="0 0 32 32" fill="#ffffff" aria-label="ModelMonitor">
            <rect x="0" y="2" width="32" height="4"/><rect x="0" y="8" width="32" height="4"/>
            <rect x="4" y="14" width="24" height="4"/><rect x="4" y="20" width="24" height="4"/>
            <rect x="0" y="26" width="32" height="4"/>
          </svg>
          <span style={{ ...typo.bodyShort02, color: "#ffffff", letterSpacing: "0.16px" }}>
            ModelMonitor
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="cds-pulse" style={{ width: "6px", height: "6px", borderRadius: "50%", background: CDS.supportSuccess, display: "inline-block" }} />
          <span style={{ ...typo.code01, fontSize: "11px", color: CDS.navText, letterSpacing: "0.32px" }}>APR 2026</span>
        </div>
      </nav>

      {/* ── HEADER ── */}
      <header style={{ background: CDS.background, padding: "48px 32px 32px", borderBottom: `1px solid ${CDS.borderSubtle}` }}>
        {/* Display headline */}
        <h1 style={{ ...typo.display01, marginBottom: "16px", maxWidth: "720px" }}>
          April in AI
          <span style={{ display: "block", color: CDS.interactive }}>2026 Model Release Tracker</span>
        </h1>
        <p style={{ ...typo.bodyLong01, maxWidth: "600px", marginBottom: "40px" }}>
          Week-by-week coverage of every significant AI model release in April 2026 — open weights, proprietary, and everything in between.
        </p>

        {/* ── Stat tiles (Carbon Layer 01: #f4f4f4, 0px radius, no shadow) ── */}
        <div className="cds-stats-row" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1px", background: CDS.borderSubtle }}>
          {STATS.map((st, i) => (
            <div key={i} className="cds-stat-tile" style={{
              background: CDS.layer01,
              padding: "24px 20px 20px",
              borderRadius: "0",
            }}>
              <div style={{
                ...typo.display01,
                fontSize: "clamp(28px,3vw,42px)",
                fontFamily: "'IBM Plex Mono', monospace",
                color: CDS.textPrimary,
                lineHeight: 1,
                marginBottom: "8px",
              }}>
                {st.value}
              </div>
              <div style={{ ...typo.caption01, textTransform: "uppercase", letterSpacing: "0.32px" }}>
                {st.label}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* ── BODY ── */}
      <main style={{ padding: "32px" }}>

        {/* Controls row */}
        <div className="cds-controls-row" style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "24px",
          flexWrap: "wrap", gap: "12px",
        }}>
          {/* Week tabs (Carbon bottom-border Tab pattern) */}
          <div className="cds-tab-row" style={{
            display: "flex", gap: "0",
            borderBottom: `1px solid ${CDS.borderSubtle}`,
          }}>
            {WEEKS.map(w => {
              const active = activeWeek === w.id;
              return (
                <button
                  key={w.id}
                  className="cds-tab"
                  style={{
                    ...typo.bodyShort01,
                    fontWeight: active ? 600 : 400,
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: active ? `2px solid ${CDS.interactive}` : "2px solid transparent",
                    background: "transparent",
                    color: active ? CDS.textPrimary : CDS.textSecondary,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => setActiveWeek(w.id)}
                  aria-pressed={active}
                >
                  {w.label}
                  <span style={{ ...typo.caption01, marginLeft: "6px", color: CDS.textSecondary }}>
                    ({w.id !== "all" ? models.filter(m => m.week === w.id).length : models.length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* View toggle (Ghost button group) */}
          <div style={{ display: "flex", border: `1px solid ${CDS.borderSubtle}` }}>
            {[
              { id: "grid",    label: "⊞  Grid" },
              { id: "list",    label: "☰  List" },
              { id: "summary", label: "◈  Summary" },
            ].map(v => {
              const active = activeView === v.id;
              return (
                <button
                  key={v.id}
                  className="cds-view-btn"
                  style={{
                    ...typo.bodyShort01,
                    padding: "10px 16px",
                    border: "none",
                    borderRight: v.id !== "summary" ? `1px solid ${CDS.borderSubtle}` : "none",
                    background: active ? CDS.interactive : "transparent",
                    color: active ? "#ffffff" : CDS.textSecondary,
                    cursor: "pointer",
                    borderRadius: "0",
                  }}
                  onClick={() => setActiveView(v.id)}
                  aria-pressed={active}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Week range label */}
        {activeWeek !== "all" && (
          <div style={{ ...typo.caption01, marginBottom: "16px", textTransform: "uppercase" }}>
            {WEEKS.find(w => w.id === activeWeek)?.range} — {filtered.length} release{filtered.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* ── GRID VIEW ── */}
        {activeView === "grid" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(296px, 1fr))",
            gap: "1px",
            background: CDS.borderSubtle,
          }}>
            {filtered.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 20px", ...typo.bodyShort01, color: CDS.textSecondary }}>
                No releases in this period.
              </div>
            )}
            {filtered.map((m, i) => (
              <div
                key={m.id}
                className="cds-tile cds-fade-in"
                style={{
                  background: CDS.background,
                  padding: "24px 20px 20px",
                  borderRadius: "0",
                  position: "relative",
                  animationDelay: `${i * 0.04}s`,
                }}
                onClick={() => setSelected(m)}
                role="button"
                tabIndex={0}
                aria-label={`${m.name} by ${m.company}`}
                onKeyDown={e => e.key === "Enter" && setSelected(m)}
              >
                {/* Top blue accent bar (2px) */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: CDS.interactive }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
                  <h2 style={{ ...typo.heading04, fontSize: "16px" }}>{m.name}</h2>
                  <LicenseTag lic={m.license} />
                </div>

                <div style={{ ...typo.code01, fontSize: "11px", color: CDS.interactive, textTransform: "uppercase", letterSpacing: "0.32px", marginBottom: "4px" }}>
                  {m.company}
                </div>
                <div style={{ ...typo.caption01, marginBottom: "12px" }}>
                  {formatDate(m.date)}
                </div>
                <p style={{ ...typo.bodyShort01, color: CDS.textSecondary, marginBottom: "16px" }}>
                  {m.summary}
                </p>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {m.tags.map(t => <Tag key={t}>{t}</Tag>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {activeView === "list" && (
          <div style={{ borderTop: `1px solid ${CDS.borderSubtle}` }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "64px 20px", ...typo.bodyShort01, color: CDS.textSecondary }}>
                No releases in this period.
              </div>
            )}
            {filtered.map((m, i) => (
              <div
                key={m.id}
                className="cds-tile cds-fade-in"
                style={{
                  background: CDS.background,
                  borderBottom: `1px solid ${CDS.borderSubtle}`,
                  borderLeft: `3px solid ${CDS.interactive}`,
                  padding: "14px 16px",
                  display: "flex", alignItems: "center", gap: "16px",
                  animationDelay: `${i * 0.03}s`,
                }}
                onClick={() => setSelected(m)}
                role="button"
                tabIndex={0}
                aria-label={`${m.name} by ${m.company}`}
                onKeyDown={e => e.key === "Enter" && setSelected(m)}
              >
                {/* Date pill */}
                <div style={{ ...typo.code01, fontSize: "11px", color: CDS.textSecondary, background: CDS.layer01, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "0.16px" }}>
                  {formatDateShort(m.date)}
                </div>
                <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                  <div style={{ ...typo.bodyShort02 }}>{m.name}</div>
                  <div style={{ ...typo.code01, fontSize: "11px", color: CDS.interactive, textTransform: "uppercase", letterSpacing: "0.32px", marginTop: "2px" }}>{m.company}</div>
                </div>
                <div className="cds-list-summary-col" style={{ ...typo.bodyShort01, color: CDS.textSecondary, flex: 2 }}>
                  {m.summary}
                </div>
                <LicenseTag lic={m.license} />
                <span className="cds-list-arrow">›</span>
              </div>
            ))}
          </div>
        )}

        {/* ── SUMMARY VIEW ── */}
        {activeView === "summary" && (
          <div className="cds-fade-in">
            {/* Narrative block */}
            <div style={{ background: CDS.layer01, padding: "32px", marginBottom: "1px", borderTop: `2px solid ${CDS.interactive}` }}>
              <h2 style={{ ...typo.heading04, marginBottom: "12px" }}>April 2026 — AI Release Summary</h2>
              <p style={{ ...typo.bodyLong01, maxWidth: "800px" }}>
                In just 24 days, {companyCount} major AI companies shipped {models.length} significant model releases.{" "}
                {openCount} of these were open weights or open source, representing {Math.round(openCount / models.length * 100)}% of total releases.{" "}
                Alibaba led with 3 releases. Anthropic and Meta both shipped major capability upgrades.{" "}
                The pace of releases across coding benchmarks, agentic workflows, and long-context tasks signals rapid convergence toward capable, long-running agent models.
              </p>
            </div>

            <div className="cds-summary-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: CDS.borderSubtle, marginBottom: "1px" }}>
              {/* By Company */}
              <div style={{ background: CDS.background, padding: "24px" }}>
                <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "20px" }}>Releases by Company</div>
                {companySummary.map(([company, count], i) => (
                  <div key={company} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ ...typo.bodyShort01, width: "100px", flexShrink: 0, color: CDS.textSecondary }}>{company}</div>
                    <div style={{ flex: 1, height: "4px", background: CDS.layer01 }}>
                      <div className="cds-bar-fill" style={{ height: "100%", width: `${(count / models.length) * 100}%`, background: COMPANY_COLORS[company] || CDS.interactive }} />
                    </div>
                    <div style={{ ...typo.code01, fontSize: "12px", color: CDS.textSecondary, width: "16px", textAlign: "right" }}>{count}</div>
                  </div>
                ))}
              </div>

              {/* License + Week breakdown */}
              <div style={{ background: CDS.background, padding: "24px" }}>
                <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "20px" }}>License Breakdown</div>
                {[
                  ["Open / Weights / MIT", openCount, CDS.supportSuccess],
                  ["Proprietary / Gated", models.length - openCount, CDS.supportError],
                ].map(([label, count, color], i) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ ...typo.bodyShort01, width: "150px", flexShrink: 0, color: CDS.textSecondary }}>{label}</div>
                    <div style={{ flex: 1, height: "4px", background: CDS.layer01 }}>
                      <div className="cds-bar-fill" style={{ height: "100%", width: `${(count / models.length) * 100}%`, background: color }} />
                    </div>
                    <div style={{ ...typo.code01, fontSize: "12px", color: CDS.textSecondary, width: "16px", textAlign: "right" }}>{count}</div>
                  </div>
                ))}

                <div style={{ borderTop: `1px solid ${CDS.borderSubtle}`, margin: "20px 0" }} />

                <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "20px" }}>Releases by Week</div>
                {[4, 3, 2, 1].map(w => {
                  const wc = models.filter(m => m.week === w).length;
                  return (
                    <div key={w} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                      <div style={{ ...typo.bodyShort01, width: "64px", flexShrink: 0, color: CDS.textSecondary }}>Week {w}</div>
                      <div style={{ flex: 1, height: "4px", background: CDS.layer01 }}>
                        <div className="cds-bar-fill" style={{ height: "100%", width: `${(wc / models.length) * 100}%`, background: CDS.interactive }} />
                      </div>
                      <div style={{ ...typo.code01, fontSize: "12px", color: CDS.textSecondary, width: "16px", textAlign: "right" }}>{wc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notable Highlights */}
            <div style={{ background: CDS.background, padding: "24px", border: `1px solid ${CDS.borderSubtle}` }}>
              <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "20px" }}>Notable Highlights</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1px", background: CDS.borderSubtle }}>
                {[
                  { label: "Largest Model",    value: "DeepSeek V4",         sub: "1.6T parameters" },
                  { label: "Largest Context",  value: "Llama 4 Scout",        sub: "10M token context" },
                  { label: "Most Agents",      value: "Kimi K2.6",            sub: "300 parallel sub-agents" },
                  { label: "Most Restricted",  value: "Claude Mythos Preview", sub: "Gated to 50 orgs, ASL-4" },
                  { label: "Best Value",       value: "DeepSeek V4",          sub: "Fraction of GPT-5.5 cost" },
                  { label: "Top Benchmark",    value: "GLM-5.1",              sub: "Beats GPT-5.4 on SWE-bench" },
                ].map(item => (
                  <div key={item.label} style={{ background: CDS.layer01, padding: "20px 16px", borderTop: `2px solid ${CDS.interactive}` }}>
                    <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "8px" }}>{item.label}</div>
                    <div style={{ ...typo.bodyShort02, color: CDS.interactive, marginBottom: "4px" }}>{item.value}</div>
                    <div style={{ ...typo.caption01 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── MODAL (Carbon Dialog / Side Panel style) ── */}
      {selected && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(22,22,22,0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 300,
            display: "flex", alignItems: "center",
            justifyContent: "center", padding: "20px",
          }}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${selected.name}`}
        >
          <div
            className="cds-modal-enter"
            style={{
              background: CDS.background,
              width: "100%", maxWidth: "540px",
              position: "relative",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              borderTop: `2px solid ${CDS.interactive}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="cds-close-btn"
              style={{
                position: "absolute", top: "16px", right: "16px",
                background: "transparent",
                border: `1px solid ${CDS.borderSubtle}`,
                color: CDS.textSecondary,
                cursor: "pointer",
                width: "32px", height: "32px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "18px", lineHeight: 1,
                borderRadius: "0",
              }}
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>

            {/* Modal content */}
            <div style={{ padding: "32px" }}>
              {/* Week badge */}
              <div style={{
                display: "inline-block",
                background: CDS.layer01,
                color: CDS.textSecondary,
                ...typo.caption01, textTransform: "uppercase",
                padding: "2px 8px",
                marginBottom: "12px",
              }}>
                Week {selected.week} of April
              </div>

              <h2 style={{ ...typo.display01, fontSize: "clamp(24px,3vw,36px)", marginBottom: "4px" }}>
                {selected.name}
              </h2>
              <div style={{ ...typo.code01, fontSize: "11px", color: CDS.interactive, textTransform: "uppercase", letterSpacing: "0.32px", marginBottom: "4px" }}>
                {selected.company}
              </div>
              <div style={{ ...typo.caption01, marginBottom: "24px" }}>{formatDate(selected.date)}</div>

              <div style={{ borderTop: `1px solid ${CDS.borderSubtle}`, marginBottom: "20px" }} />

              {/* Overview */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "10px" }}>Overview</div>
                <p style={{ ...typo.bodyLong01 }}>{selected.summary}</p>
              </div>

              {/* Key highlights */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ ...typo.caption01, textTransform: "uppercase", marginBottom: "10px" }}>Key Highlights</div>
                {selected.highlights.map(h => (
                  <div key={h} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: CDS.interactive, flexShrink: 0, marginTop: "7px" }} />
                    <span style={{ ...typo.bodyShort01, color: CDS.textSecondary }}>{h}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: `1px solid ${CDS.borderSubtle}`, marginBottom: "20px" }} />

              {/* Tags */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                <LicenseTag lic={selected.license} />
                {selected.tags.map(t => <Tag key={t}>{t}</Tag>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER (Carbon style: Gray 100 bg, white text) ── */}
      <footer style={{
        background: CDS.navBg,
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "8px",
        marginTop: "auto",
      }}>
        <div style={{ ...typo.code01, fontSize: "12px", color: CDS.navText, letterSpacing: "0.32px" }}>
          ModelMonitor — April 2026
        </div>
        <div style={{ ...typo.code01, fontSize: "12px", color: CDS.navText, letterSpacing: "0.16px" }}>
          {models.length} models · {companyCount} companies
        </div>
      </footer>

    </div>
  );
}
