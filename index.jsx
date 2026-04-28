const { useState, useEffect, useCallback } = React;

// ── DATA is fetched from /public/models.json at runtime ──
// Add new models there; this file does not need to change.

const FALLBACK_MODELS = [
  {
    id: 1, name: "DeepSeek V4", company: "DeepSeek", date: "2026-04-24",
    week: 4, color: "#5b9cf6",
    tags: ["Open Weights", "1.6T Params"],
    license: "Open Weights",
    summary: "1.6T parameters, 1M context window. Costs a fraction of GPT-5.5.",
    highlights: ["1.6T parameters", "1M token context", "Fraction of GPT-5.5 cost"],
  },
  {
    id: 2, name: "GPT-5.5", company: "OpenAI", date: "2026-04-23",
    week: 4, color: "#10a37f",
    tags: ["Proprietary", "Agentic"],
    license: "Proprietary",
    summary: "Smartest OpenAI model yet. Stronger coding and agentic workflows at same speed as 5.4.",
    highlights: ["Strongest OpenAI model", "Improved agentic workflows", "Same speed as GPT-5.4"],
  },
  {
    id: 3, name: "Qwen3.6-27B", company: "Alibaba", date: "2026-04-22",
    week: 4, color: "#f97316",
    tags: ["Open Source"],
    license: "Open Source",
    summary: "Open source mid-size coding model. Solid performance for its parameter count.",
    highlights: ["27B parameters", "Open source", "Strong coding focus"],
  },
  {
    id: 4, name: "Kimi K2.6", company: "Moonshot AI", date: "2026-04-20",
    week: 3, color: "#a78bfa",
    tags: ["Open Weights", "MoE", "Multi-agent"],
    license: "Open Weights",
    summary: "1T open-weight MoE model. 300 parallel sub-agents, capable of running 12+ hours nonstop.",
    highlights: ["1T parameter MoE", "300 parallel sub-agents", "12+ hour continuous runs"],
  },
  {
    id: 5, name: "Qwen3.6-Max-Preview", company: "Alibaba", date: "2026-04-20",
    week: 3, color: "#f97316",
    tags: ["Proprietary", "Flagship"],
    license: "Proprietary",
    summary: "Proprietary flagship. Claimed top scores on 6 major coding benchmarks.",
    highlights: ["Proprietary flagship tier", "Top 6 coding benchmarks", "Max-tier preview"],
  },
  {
    id: 6, name: "Claude Opus 4.7", company: "Anthropic", date: "2026-04-16",
    week: 3, color: "#e879a0",
    tags: ["Proprietary", "Reasoning"],
    license: "Proprietary",
    summary: "Biggest upgrade for complex reasoning and long-running agentic tasks.",
    highlights: ["Complex reasoning upgrade", "Long-running agent work", "Anthropic flagship"],
  },
  {
    id: 7, name: "Qwen3.6-35B-A3B", company: "Alibaba", date: "2026-04-16",
    week: 3, color: "#f97316",
    tags: ["Open Source", "Apache 2.0"],
    license: "Apache 2.0",
    summary: "Open source release under Apache 2.0 license. 35B total, 3B active parameters.",
    highlights: ["35B total / 3B active params", "Apache 2.0", "Open source"],
  },
  {
    id: 8, name: "Llama 4", company: "Meta", date: "2026-04-08",
    week: 2, color: "#3b82f6",
    tags: ["Open Weights", "10M Context"],
    license: "Open Weights",
    summary: "Open weights. Scout model ships with 10M token context window.",
    highlights: ["10M token context", "Scout model variant", "Open weights"],
  },
  {
    id: 9, name: "GLM-5.1", company: "Zhipu AI", date: "2026-04-07",
    week: 2, color: "#facc15",
    tags: ["MIT License"],
    license: "MIT",
    summary: "MIT licensed. Outperformed GPT-5.4 and Opus 4.6 on SWE-bench Pro.",
    highlights: ["MIT license", "Beats GPT-5.4 on SWE-bench Pro", "Beats Opus 4.6 on SWE-bench Pro"],
  },
  {
    id: 10, name: "Claude Mythos Preview", company: "Anthropic", date: "2026-04-07",
    week: 2, color: "#e879a0",
    tags: ["Gated", "ASL-4"],
    license: "Gated",
    summary: "Gated to 50 organizations. Triggered Anthropic ASL-4 safety protocol.",
    highlights: ["Limited to 50 orgs", "ASL-4 safety triggered", "Preview access only"],
  },
  {
    id: 11, name: "Gemma 4 31B", company: "Google", date: "2026-04-02",
    week: 1, color: "#34d399",
    tags: ["Open Source"],
    license: "Open Source",
    summary: "Open source. Outperforms models 20x its size in benchmarks.",
    highlights: ["31B parameters", "Beats models 20x larger", "Open source"],
  },
];


const WEEKS = [
  { id: "all", label: "All Releases", range: "Apr 1 – 24" },
  { id: 4, label: "Week 4", range: "Apr 21 – 27" },
  { id: 3, label: "Week 3", range: "Apr 14 – 20" },
  { id: 2, label: "Week 2", range: "Apr 7 – 13" },
  { id: 1, label: "Week 1", range: "Apr 1 – 6" },
];

const COMPANY_COLORS = {
  "DeepSeek": "#5b9cf6",
  "OpenAI": "#10a37f",
  "Alibaba": "#f97316",
  "Moonshot AI": "#a78bfa",
  "Anthropic": "#e879a0",
  "Meta": "#3b82f6",
  "Zhipu AI": "#facc15",
  "Google": "#34d399",
};

const LICENSE_STYLE = {
  "Open Weights": { bg: "rgba(26,47,26,0.9)", color: "#4ade80", border: "#166534" },
  "Open Source":  { bg: "rgba(26,47,26,0.9)", color: "#4ade80", border: "#166534" },
  "MIT":          { bg: "rgba(26,47,26,0.9)", color: "#4ade80", border: "#166534" },
  "Apache 2.0":   { bg: "rgba(26,47,26,0.9)", color: "#4ade80", border: "#166534" },
  "Proprietary":  { bg: "rgba(42,26,26,0.9)", color: "#f87171", border: "#991b1b" },
  "Gated":        { bg: "rgba(42,26,32,0.9)", color: "#f472b6", border: "#9d174d" },
};

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
  const [mounted, setMounted] = useState(false);
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [loadState, setLoadState] = useState("idle"); // "idle" | "loading" | "error"

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
        // FALLBACK_MODELS already set as default, so UI still works
      });
  }, []);

  useEffect(() => {
    setMounted(true);
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #070b12; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #070b12; }
      ::-webkit-scrollbar-thumb { background: #1e2d40; border-radius: 2px; }

      .card-hover {
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease, border-color 0.22s ease;
        cursor: pointer;
      }
      .card-hover:hover { transform: translateY(-3px); }

      .tab-btn {
        transition: color 0.15s ease, background 0.15s ease, border-bottom-color 0.15s ease;
        touch-action: manipulation;
      }
      .view-btn { transition: all 0.15s ease; touch-action: manipulation; }

      .fade-in { animation: fadeUp 0.38s cubic-bezier(0.22,1,0.36,1) both; }
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .modal-enter { animation: modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both; }
      @keyframes modalIn {
        from { opacity: 0; transform: scale(0.96) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }

      .pulse-dot { animation: pulse 2s ease-in-out infinite; }
      @keyframes pulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
        50%       { opacity: 0.6; box-shadow: 0 0 0 4px rgba(74,222,128,0); }
      }

      .bar-fill { animation: barGrow 0.7s cubic-bezier(0.22,1,0.36,1) both; }
      @keyframes barGrow { from { width: 0% !important; } }

      .list-arrow {
        opacity: 0;
        transform: translateX(-4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        font-size: 18px;
        color: #4a6080;
      }
      .card-hover:hover .list-arrow {
        opacity: 1;
        transform: translateX(0);
      }

      .close-btn {
        transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
      }
      .close-btn:hover {
        background: #1e2d40 !important;
        color: #e2e8f0 !important;
        transform: scale(1.1);
      }

      .stat-card-hover {
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .stat-card-hover:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }

      .highlight-card-hover {
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .highlight-card-hover:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      }

      @media (max-width: 640px) {
        .stats-row { display: grid !important; grid-template-columns: 1fr 1fr !important; }
        .controls-row { flex-direction: column !important; align-items: stretch !important; }
        .list-summary-col { display: none !important; }
        .summary-grid { grid-template-columns: 1fr !important; }
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

  const s = {
    root: {
      fontFamily: "'Outfit', sans-serif",
      background: "#070b12",
      minHeight: "100vh",
      color: "#e2e8f0",
    },

    // ── HEADER ──
    header: {
      position: "relative",
      background: "linear-gradient(180deg, #0a1020 0%, #070b12 100%)",
      borderBottom: "1px solid #1a2840",
      padding: "28px 32px 24px",
      overflow: "hidden",
    },
    headerGlow: {
      position: "absolute", top: 0, left: "50%",
      transform: "translateX(-50%)",
      width: "600px", height: "200px",
      background: "radial-gradient(ellipse at top, rgba(91,156,246,0.07) 0%, transparent 70%)",
      pointerEvents: "none",
    },
    headerTop: {
      position: "relative",
      display: "flex", alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: "24px",
    },
    title: {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: "clamp(32px, 4.5vw, 52px)",
      letterSpacing: "4px", lineHeight: 1, color: "#fff",
    },
    titleAccent: {
      background: "linear-gradient(135deg, #5b9cf6, #a78bfa)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    },
    subtitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color: "#3d5270",
      letterSpacing: "3px", marginTop: "6px",
      textTransform: "uppercase",
    },
    liveTag: {
      display: "flex", alignItems: "center", gap: "7px",
      background: "rgba(13,31,13,0.8)",
      border: "1px solid #166534",
      borderRadius: "6px", padding: "5px 12px",
      fontSize: "11px",
      fontFamily: "'IBM Plex Mono', monospace",
      color: "#4ade80", letterSpacing: "2px",
      backdropFilter: "blur(8px)",
    },

    // ── STAT CARDS ──
    statsRow: {
      position: "relative",
      display: "flex", gap: "10px", flexWrap: "wrap",
    },
    statCard: (accentColor) => ({
      background: "rgba(13,18,27,0.85)",
      border: "1px solid #1a2840",
      borderTop: `2px solid ${accentColor}`,
      borderRadius: "8px",
      padding: "14px 20px", flex: "1", minWidth: "120px",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    }),
    statNum: {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: "38px", letterSpacing: "2px", lineHeight: 1,
    },
    statLabel: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "10px", color: "#3d5270",
      letterSpacing: "2px", textTransform: "uppercase", marginTop: "3px",
    },

    // ── BODY ──
    body: { padding: "24px 32px" },
    controls: {
      display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: "20px",
      flexWrap: "wrap", gap: "10px",
    },
    tabRow: {
      display: "flex", gap: "2px",
      background: "rgba(13,18,27,0.8)",
      border: "1px solid #1a2840",
      borderRadius: "8px", padding: "4px",
      backdropFilter: "blur(8px)",
    },
    tab: (active) => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", letterSpacing: "1px",
      padding: "7px 14px", borderRadius: "5px",
      border: "none", cursor: "pointer",
      background: active ? "#1a2d47" : "transparent",
      color: active ? "#93c5fd" : "#3d5270",
      borderBottom: active ? "2px solid #5b9cf6" : "2px solid transparent",
      fontWeight: active ? 600 : 400,
    }),
    viewToggle: {
      display: "flex", gap: "2px",
      background: "rgba(13,18,27,0.8)",
      border: "1px solid #1a2840",
      borderRadius: "8px", padding: "4px",
      backdropFilter: "blur(8px)",
    },
    viewBtn: (active) => ({
      padding: "7px 14px", borderRadius: "5px",
      border: "none", cursor: "pointer",
      background: active ? "#1a2d47" : "transparent",
      color: active ? "#93c5fd" : "#3d5270",
      fontSize: "11px",
      fontFamily: "'IBM Plex Mono', monospace",
      letterSpacing: "1px",
      fontWeight: active ? 600 : 400,
    }),

    // ── GRID CARDS ──
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
      gap: "12px",
    },
    card: (color) => ({
      background: "rgba(13,18,27,0.88)",
      border: "1px solid #1a2840",
      borderTop: `2px solid ${color}`,
      borderRadius: "8px", padding: "20px 20px 16px",
      position: "relative", overflow: "hidden",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    }),
    cardGlow: (color) => ({
      position: "absolute", top: 0, right: 0,
      width: "100px", height: "100px",
      background: `radial-gradient(circle at top right, ${color}14, transparent 70%)`,
      pointerEvents: "none",
    }),
    cardName: {
      fontSize: "16px", fontWeight: 600,
      color: "#f1f5f9", marginBottom: "2px", letterSpacing: "0.2px",
    },
    cardCompany: (color) => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color,
      letterSpacing: "1.5px", textTransform: "uppercase",
      marginBottom: "8px", fontWeight: 500,
    }),
    cardDate: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color: "#3d5270",
      marginBottom: "10px", letterSpacing: "0.5px",
    },
    cardSummary: {
      fontSize: "13px", color: "#7a92b0",
      lineHeight: 1.65, marginBottom: "14px",
    },
    tags: { display: "flex", gap: "6px", flexWrap: "wrap" },
    tag: {
      fontSize: "10px",
      fontFamily: "'IBM Plex Mono', monospace",
      padding: "3px 8px", borderRadius: "4px",
      background: "rgba(19,29,46,0.8)",
      border: "1px solid #1e2d40",
      color: "#4a6080", letterSpacing: "0.5px",
    },
    licenseTag: (lic) => {
      const st = LICENSE_STYLE[lic] || LICENSE_STYLE["Proprietary"];
      return {
        fontSize: "10px",
        fontFamily: "'IBM Plex Mono', monospace",
        padding: "3px 8px", borderRadius: "4px",
        background: st.bg,
        border: `1px solid ${st.border}`,
        color: st.color,
        letterSpacing: "0.8px",
        fontWeight: 600,
        textTransform: "uppercase",
      };
    },

    // ── LIST VIEW ──
    listItem: (color) => ({
      background: "rgba(13,18,27,0.88)",
      border: "1px solid #1a2840",
      borderLeft: `3px solid ${color}`,
      borderRadius: "8px", padding: "14px 18px",
      display: "flex", alignItems: "center", gap: "16px",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    }),
    listDatePill: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color: "#4a6080",
      background: "rgba(19,29,46,0.8)",
      border: "1px solid #1e2d40",
      borderRadius: "4px", padding: "3px 8px",
      whiteSpace: "nowrap", flexShrink: 0,
    },
    listName: { fontSize: "15px", fontWeight: 600, color: "#f1f5f9" },
    listCompany: (color) => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "10px", color, letterSpacing: "1px",
      textTransform: "uppercase", marginTop: "2px", fontWeight: 500,
    }),
    listSummary: {
      fontSize: "12px", color: "#4a6080",
      flex: 2, lineHeight: 1.5,
    },

    // ── MODAL ──
    overlay: {
      position: "fixed", inset: 0,
      background: "rgba(4,7,14,0.88)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      zIndex: 100,
      display: "flex", alignItems: "center",
      justifyContent: "center", padding: "20px",
    },
    modal: {
      background: "rgba(10,15,25,0.97)",
      border: "1px solid #1a2840",
      borderRadius: "12px",
      width: "100%", maxWidth: "520px",
      padding: "28px", position: "relative",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
    },
    modalTopBorder: (color) => ({
      position: "absolute", top: 0, left: 0, right: 0,
      height: "2px",
      background: `linear-gradient(90deg, ${color}, ${color}44, transparent)`,
      borderRadius: "12px 12px 0 0",
    }),
    modalGlow: (color) => ({
      position: "absolute", top: 0, right: 0,
      width: "200px", height: "200px",
      background: `radial-gradient(circle at top right, ${color}10, transparent 70%)`,
      borderRadius: "0 12px 0 0",
      pointerEvents: "none",
    }),
    modalHeader: { paddingLeft: "0", marginBottom: "20px", marginTop: "8px" },
    modalWeekBadge: {
      display: "inline-flex", alignItems: "center",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "10px", color: "#3d5270",
      background: "rgba(19,29,46,0.8)",
      border: "1px solid #1e2d40",
      borderRadius: "4px", padding: "2px 8px",
      letterSpacing: "1px", textTransform: "uppercase",
      marginBottom: "10px",
    },
    modalName: {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: "30px", letterSpacing: "2px", color: "#f1f5f9",
    },
    modalCompany: (color) => ({
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color,
      letterSpacing: "2px", textTransform: "uppercase",
      marginTop: "3px", fontWeight: 500,
    }),
    modalDate: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color: "#3d5270", marginTop: "4px",
    },
    divider: { borderTop: "1px solid #1a2840", margin: "16px 0" },
    modalSection: { marginBottom: "16px" },
    modalSectionTitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "10px", color: "#3d5270",
      letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px",
    },
    highlight: {
      display: "flex", alignItems: "flex-start",
      gap: "10px", marginBottom: "8px",
      fontSize: "13px", color: "#7a92b0", lineHeight: 1.55,
    },
    bullet: (color) => ({
      width: "6px", height: "6px", borderRadius: "50%",
      background: color, flexShrink: 0, marginTop: "5px",
      boxShadow: `0 0 6px ${color}80`,
    }),
    closeBtn: {
      position: "absolute", top: "16px", right: "16px",
      background: "rgba(19,29,46,0.8)",
      border: "1px solid #1a2840",
      borderRadius: "6px", color: "#4a6080",
      cursor: "pointer", fontSize: "16px",
      width: "30px", height: "30px",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "sans-serif", lineHeight: 1,
    },

    // ── SUMMARY VIEW ──
    summaryGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px", marginTop: "16px",
    },
    summaryCard: {
      background: "rgba(13,18,27,0.88)",
      border: "1px solid #1a2840",
      borderRadius: "8px", padding: "20px 22px",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    },
    summaryTitle: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "10px", color: "#3d5270",
      letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px",
    },
    barRow: {
      display: "flex", alignItems: "center",
      gap: "10px", marginBottom: "12px",
    },
    barLabel: { fontSize: "12px", color: "#7a92b0", width: "100px", flexShrink: 0 },
    barTrack: {
      flex: 1, height: "4px",
      background: "rgba(19,29,46,0.8)",
      borderRadius: "4px", overflow: "hidden",
    },
    barFill: (w, color) => ({
      height: "100%", width: `${w}%`,
      background: `linear-gradient(90deg, ${color}, ${color}88)`,
      borderRadius: "4px",
      boxShadow: `0 0 8px ${color}44`,
    }),
    barCount: {
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "11px", color: "#3d5270",
      width: "16px", textAlign: "right",
    },
  };

  const STATS = [
    { value: models.length,             label: "Total Releases",       color: "#5b9cf6" },
    { value: companyCount,              label: "Companies",            color: "#a78bfa" },
    { value: openCount,                 label: "Open Weights / Source", color: "#4ade80" },
    { value: models.length - openCount, label: "Proprietary / Gated", color: "#f97316" },
    { value: [...new Set(models.map(m => m.week))].length, label: "Active Weeks", color: "#64748b" },
  ];

  // ── Loading / Error banner ──
  const LoadBanner = () => {
    if (loadState === "loading") return (
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#3d5270",
        textAlign: "center", padding: "8px", letterSpacing: "2px",
        background: "rgba(13,18,27,0.8)", borderBottom: "1px solid #1a2840" }}>
        ⟳ FETCHING LATEST MODELS…
      </div>
    );
    if (loadState === "error") return (
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#f87171",
        textAlign: "center", padding: "8px", letterSpacing: "2px",
        background: "rgba(42,13,13,0.8)", borderBottom: "1px solid #991b1b" }}>
        ⚠ COULD NOT FETCH models.json — SHOWING CACHED DATA
      </div>
    );
    return null;
  };

  return (
    <div style={s.root}>
      <LoadBanner />

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={s.headerGlow} />
        <div style={s.headerTop}>
          <div>
            <div style={s.title}>
              <span style={s.titleAccent}>APRIL</span> IN AI
            </div>
            <div style={s.subtitle}>2026 Model Release Tracker — Week-by-Week</div>
          </div>
          <div style={s.liveTag}>
            <span className="pulse-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
            APR 2026
          </div>
        </div>

        <div className="stats-row" style={s.statsRow}>
          {STATS.map((st, i) => (
            <div key={i} className="stat-card-hover" style={s.statCard(st.color)}>
              <div style={{ ...s.statNum, color: st.color }}>{st.value}</div>
              <div style={s.statLabel}>{st.label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* ── BODY ── */}
      <main style={s.body}>

        {/* Controls */}
        <div className="controls-row" style={s.controls}>
          <div style={s.tabRow}>
            {WEEKS.map(w => (
              <button
                key={w.id}
                className="tab-btn"
                style={s.tab(activeWeek === w.id)}
                onClick={() => setActiveWeek(w.id)}
                aria-pressed={activeWeek === w.id}
              >
                {w.label}
                <span style={{ color: "#2a4060", marginLeft: "5px", fontSize: "10px" }}>
                  {w.id !== "all"
                    ? `(${models.filter(m => m.week === w.id).length})`
                    : `(${models.length})`}
                </span>
              </button>
            ))}
          </div>

          <div style={s.viewToggle}>
            <button className="view-btn" style={s.viewBtn(activeView === "grid")}    onClick={() => setActiveView("grid")}>⊞ GRID</button>
            <button className="view-btn" style={s.viewBtn(activeView === "list")}    onClick={() => setActiveView("list")}>☰ LIST</button>
            <button className="view-btn" style={s.viewBtn(activeView === "summary")} onClick={() => setActiveView("summary")}>◈ SUMMARY</button>
          </div>
        </div>

        {/* Week range label */}
        {activeWeek !== "all" && (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#3d5270", letterSpacing: "2px", marginBottom: "16px", textTransform: "uppercase" }}>
            {WEEKS.find(w => w.id === activeWeek)?.range} — {filtered.length} release{filtered.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* ── GRID VIEW ── */}
        {activeView === "grid" && (
          <div style={s.grid}>
            {filtered.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 20px", fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: "#3d5270", letterSpacing: "2px" }}>
                NO RELEASES IN THIS PERIOD
              </div>
            )}
            {filtered.map((m, i) => (
              <div
                key={m.id}
                className="card-hover fade-in"
                style={{ ...s.card(m.color), animationDelay: `${i * 0.05}s` }}
                onClick={() => setSelected(m)}
                role="button"
                tabIndex={0}
                aria-label={`${m.name} by ${m.company}`}
                onKeyDown={e => e.key === "Enter" && setSelected(m)}
              >
                <div style={s.cardGlow(m.color)} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", gap: "8px" }}>
                  <div style={s.cardName}>{m.name}</div>
                  <span style={{ ...s.licenseTag(m.license), flexShrink: 0 }}>{m.license}</span>
                </div>
                <div style={s.cardCompany(m.color)}>{m.company}</div>
                <div style={s.cardDate}>{formatDate(m.date)}</div>
                <div style={s.cardSummary}>{m.summary}</div>
                <div style={s.tags}>
                  {m.tags.map(t => <span key={t} style={s.tag}>{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {activeView === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: "#3d5270", letterSpacing: "2px" }}>
                NO RELEASES IN THIS PERIOD
              </div>
            )}
            {filtered.map((m, i) => (
              <div
                key={m.id}
                className="card-hover fade-in"
                style={{ ...s.listItem(m.color), animationDelay: `${i * 0.04}s` }}
                onClick={() => setSelected(m)}
                role="button"
                tabIndex={0}
                aria-label={`${m.name} by ${m.company}`}
                onKeyDown={e => e.key === "Enter" && setSelected(m)}
              >
                <div style={s.listDatePill}>{formatDateShort(m.date)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.listName}>{m.name}</div>
                  <div style={s.listCompany(m.color)}>{m.company}</div>
                </div>
                <div className="list-summary-col" style={s.listSummary}>{m.summary}</div>
                <span style={{ ...s.licenseTag(m.license), flexShrink: 0 }}>{m.license}</span>
                <span className="list-arrow">›</span>
              </div>
            ))}
          </div>
        )}

        {/* ── SUMMARY VIEW ── */}
        {activeView === "summary" && (
          <div className="fade-in">
            {/* Summary narrative card */}
            <div style={{ ...s.summaryCard, borderTop: "2px solid #1e3a5f", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: "300px", height: "100%", background: "radial-gradient(circle at top right, rgba(91,156,246,0.06), transparent 70%)", pointerEvents: "none" }} />
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "20px", letterSpacing: "2px", color: "#f1f5f9", marginBottom: "6px" }}>
                APRIL 2026 — AI RELEASE SUMMARY
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#3d5270", lineHeight: 1.9 }}>
                In just 24 days, {companyCount} major AI companies shipped {models.length} significant model releases.{" "}
                {openCount} of these were open weights or open source, representing {Math.round(openCount / models.length * 100)}% of total releases.{" "}
                Alibaba led with 3 releases. Anthropic and Meta both shipped major capability upgrades.{" "}
                The pace of releases across coding benchmarks, agentic workflows, and long-context tasks
                signals rapid convergence toward capable, long-running agent models.
              </div>
            </div>

            <div className="summary-grid" style={s.summaryGrid}>
              {/* By Company */}
              <div style={s.summaryCard}>
                <div style={s.summaryTitle}>Releases by Company</div>
                {companySummary.map(([company, count], i) => (
                  <div key={company} style={{ ...s.barRow, animationDelay: `${i * 0.07}s` }}>
                    <div style={s.barLabel}>{company}</div>
                    <div style={s.barTrack}>
                      <div className="bar-fill" style={s.barFill((count / models.length) * 100, COMPANY_COLORS[company] || "#5b9cf6")} />
                    </div>
                    <div style={s.barCount}>{count}</div>
                  </div>
                ))}
              </div>

              {/* License + Week breakdown */}
              <div style={s.summaryCard}>
                <div style={s.summaryTitle}>License Breakdown</div>
                {[
                  ["Open / Weights / MIT", openCount, "#4ade80"],
                  ["Proprietary / Gated", models.length - openCount, "#f87171"],
                ].map(([label, count, color], i) => (
                  <div key={label} style={{ ...s.barRow, animationDelay: `${i * 0.1}s` }}>
                    <div style={{ ...s.barLabel, width: "150px" }}>{label}</div>
                    <div style={s.barTrack}>
                      <div className="bar-fill" style={s.barFill((count / models.length) * 100, color)} />
                    </div>
                    <div style={s.barCount}>{count}</div>
                  </div>
                ))}
                <div style={{ ...s.divider, margin: "14px 0" }} />
                <div style={s.summaryTitle}>Releases by Week</div>
                {[4, 3, 2, 1].map((w, i) => {
                  const wc = models.filter(m => m.week === w).length;
                  return (
                    <div key={w} style={{ ...s.barRow, animationDelay: `${(i + 2) * 0.07}s` }}>
                      <div style={s.barLabel}>Week {w}</div>
                      <div style={s.barTrack}>
                        <div className="bar-fill" style={s.barFill((wc / models.length) * 100, "#5b9cf6")} />
                      </div>
                      <div style={s.barCount}>{wc}</div>
                    </div>
                  );
                })}
              </div>

              {/* Notable highlights — full width */}
              <div style={{ ...s.summaryCard, gridColumn: "1 / -1" }}>
                <div style={s.summaryTitle}>Notable Highlights</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
                  {[
                    { label: "Largest Model",    value: "DeepSeek V4",         sub: "1.6T parameters",          color: "#5b9cf6" },
                    { label: "Largest Context",  value: "Llama 4 Scout",        sub: "10M token context",        color: "#3b82f6" },
                    { label: "Most Agents",      value: "Kimi K2.6",            sub: "300 parallel sub-agents",  color: "#a78bfa" },
                    { label: "Most Restricted",  value: "Claude Mythos Preview", sub: "Gated to 50 orgs, ASL-4", color: "#e879a0" },
                    { label: "Best Value",       value: "DeepSeek V4",          sub: "Fraction of GPT-5.5 cost", color: "#5b9cf6" },
                    { label: "Top Benchmark",    value: "GLM-5.1",              sub: "Beats GPT-5.4 on SWE-bench Pro", color: "#facc15" },
                  ].map(item => (
                    <div
                      key={item.label}
                      className="highlight-card-hover"
                      style={{
                        background: `linear-gradient(135deg, rgba(19,29,46,0.9), rgba(13,18,27,0.95))`,
                        border: "1px solid #1a2840",
                        borderTop: `2px solid ${item.color}`,
                        borderRadius: "6px",
                        padding: "14px 16px",
                        position: "relative", overflow: "hidden",
                      }}
                    >
                      <div style={{ position: "absolute", top: 0, right: 0, width: "60px", height: "60px", background: `radial-gradient(circle at top right, ${item.color}14, transparent)`, pointerEvents: "none" }} />
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#3d5270", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: item.color }}>
                        {item.value}
                      </div>
                      <div style={{ fontSize: "11px", color: "#4a6080", marginTop: "3px" }}>
                        {item.sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL ── */}
      {selected && (
        <div
          style={s.overlay}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${selected.name}`}
        >
          <div className="modal-enter" style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTopBorder(selected.color)} />
            <div style={s.modalGlow(selected.color)} />

            <button
              className="close-btn"
              style={s.closeBtn}
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>

            <div style={s.modalHeader}>
              <div style={s.modalWeekBadge}>Week {selected.week} of April</div>
              <div style={s.modalName}>{selected.name}</div>
              <div style={s.modalCompany(selected.color)}>{selected.company}</div>
              <div style={s.modalDate}>{formatDate(selected.date)}</div>
            </div>

            <div style={s.divider} />

            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>Overview</div>
              <div style={{ fontSize: "13px", color: "#7a92b0", lineHeight: 1.75 }}>{selected.summary}</div>
            </div>

            <div style={s.modalSection}>
              <div style={s.modalSectionTitle}>Key Highlights</div>
              {selected.highlights.map(h => (
                <div key={h} style={s.highlight}>
                  <div style={s.bullet(selected.color)} />
                  <span>{h}</span>
                </div>
              ))}
            </div>

            <div style={s.divider} />

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={s.licenseTag(selected.license)}>{selected.license}</span>
              {selected.tags.map(t => <span key={t} style={s.tag}>{t}</span>)}
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid #1a2840",
        padding: "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "8px",
      }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#2a3f5a", letterSpacing: "3px" }}>
          // LIVE TRACKER — APRIL 2026
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#2a3f5a", letterSpacing: "1px" }}>
          {models.length} MODELS · {companyCount} COMPANIES
        </div>
      </footer>

    </div>
  );
}
