import { useState, useEffect } from "react";
import "./index.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://atlas-ai-group-dashboard-backend.onrender.com";

const colors = {
  bg: "#0a1628",
  bgElevated: "#0f1f38",
  bgCard: "#142845",
  border: "#1f3a5f",
  borderBright: "#2d4a73",
  text: "#e8eef7",
  textDim: "#8aa0bd",
  textMuted: "#5a7295",
  cyan: "#22d3ee",
  blue: "#3b82f6",
  teal: "#2dd4bf",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#a78bfa"
};

const CLIENT = {
  brandPrefix: "Atlas AI",
  brandAccent: "Consulting",
  brandSuffix: "Group",
  tagline: "Dashboard · From Insight to Impact",
  assistantTitle: "Atlas Assistant",
  chatPlaceholder: "Ask about your sequences...",
  chatExamples: 'Examples: "What\'s heating up?" or "Pause low-performers."'
};

const Sparkline = ({ data, color, width = 100, height = 18 }) => {
  if (!Array.isArray(data) || data.length < 2) return null;
  const vals = data.map(v => Number(typeof v === "object" ? v?.value : v) || 0);
  const max = Math.max(1, ...vals);
  const stepX = width / (vals.length - 1);
  const points = vals.map((v, i) => `${(i * stepX).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("atlas_tab") || "dashboard"; } catch { return "dashboard"; }
  });
  const switchTab = (t) => {
    setActiveTab(t);
    try { localStorage.setItem("atlas_tab", t); } catch {}
    window.scrollTo(0, 0);
  };

  const [health, setHealth] = useState("checking");
  const [entities, setEntities] = useState([]);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [trendsByEntity, setTrendsByEntity] = useState({});
  const [trendRange, setTrendRange] = useState("daily");
  const [insight, setInsight] = useState(null);
  const [sourceHealth, setSourceHealth] = useState(null);
  const [proposalPreviews, setProposalPreviews] = useState({});
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [actionState, setActionState] = useState({});
  const [campaignFilter, setCampaignFilter] = useState("all");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const healthRes = await fetch(`${API_BASE}/api/health`);
      const healthData = await healthRes.json();
      setHealth(healthData.status === "ok" ? "connected" : "error");

      const entRes = await fetch(`${API_BASE}/api/entities`);
      const entData = await entRes.json();
      setEntities(entData.entities || entData.emailer_campaigns || []);
      setLastRefresh(new Date());

      fetch(`${API_BASE}/api/insights`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.headline) setInsight(d); })
        .catch(() => {});

      fetch(`${API_BASE}/api/health/source`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setSourceHealth(d); })
        .catch(() => {});
    } catch (err) {
      setError(err.message);
      setHealth("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (entities.length === 0) return;
    let cancelled = false;
    Promise.all(
      entities.map(e =>
        fetch(`${API_BASE}/api/trends/${e.id}?range=${trendRange}`)
          .then(r => r.ok ? r.json() : null).catch(() => null).then(t => [e.id, t])
      )
    ).then(results => {
      if (cancelled) return;
      const map = {};
      const now = Date.now();
      const DAY = 86400000;
      for (const [id, t] of results) {
        if (!t) continue;
        // Count snapshot days within the today/7d/30d windows for honest coverage labels
        if (t.series) {
          const ref = t.series.delivered || t.series.opened || [];
          t.daysCovered = {
            today: ref.filter(v => v && v.date && now - new Date(v.date).getTime() < DAY).length,
            d7:    ref.filter(v => v && v.date && now - new Date(v.date).getTime() < 7  * DAY).length,
            d30:   ref.filter(v => v && v.date && now - new Date(v.date).getTime() < 30 * DAY).length
          };
        }
        map[id] = t;
      }
      setTrendsByEntity(map);
    });
    return () => { cancelled = true; };
  }, [entities, trendRange]);

  useEffect(() => {
    let cancelled = false;
    chatMessages.forEach((m, idx) => {
      if (!m.proposal || m.proposal.type !== "edit_step") return;
      if (!m.proposal.sequence_id || !m.proposal.step_position) return;
      if (proposalPreviews[idx] !== undefined) return;
      fetch(`${API_BASE}/api/entities/${m.proposal.sequence_id}/step/${m.proposal.step_position}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled || !data) return;
          setProposalPreviews(prev => ({ ...prev, [idx]: data }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [chatMessages]);

  const startVoiceInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported. Try Safari or Chrome."); return; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setIsListening(true);
    r.onresult = (e) => { const t = e.results[0][0].transcript; setChatInput(t); sendMessage(t); };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start();
  };

  const sendMessage = async (rawText) => {
    const text = (typeof rawText === "string" ? rawText : "").trim();
    if (!text || chatLoading) return;
    const newMessages = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages })
      });
      const data = await res.json();
      const reply = data.reply || ("Error: " + (data.error || "no reply"));
      const newAssistant = { role: "assistant", content: reply };
      if (data.proposal) newAssistant.proposal = data.proposal;
      setChatMessages([...newMessages, newAssistant]);
    } catch (err) {
      setChatMessages([...newMessages, { role: "assistant", content: "Error: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };
  const sendChat = () => sendMessage(chatInput);

  const applyProposal = async (idx) => {
    const msg = chatMessages[idx];
    if (!msg || !msg.proposal || msg.applied) return;
    const p = msg.proposal;
    const setApplied = (a) => setChatMessages(prev => prev.map((m, i) => i === idx ? { ...m, applied: a } : m));
    setApplied({ status: "applying" });
    try {
      const t = p.type || "create_sequence";
      let res;
      if (t === "create_sequence") {
        res = await fetch(`${API_BASE}/api/entities/create-from-proposal`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p)
        });
      } else if (t === "pause_sequence") {
        res = await fetch(`${API_BASE}/api/entities/${p.sequence_id}/pause`, { method: "POST" });
      } else if (t === "archive_sequence") {
        res = await fetch(`${API_BASE}/api/entities/${p.sequence_id}/archive`, { method: "POST" });
      } else if (t === "edit_step") {
        const body = {
          step_position: p.step_position,
          ...(typeof p.new_subject === "string" ? { new_subject: p.new_subject } : {}),
          ...(typeof p.new_body_text === "string" ? { new_body_text: p.new_body_text } : {}),
          ...(Number.isInteger(p.new_wait_days) ? { new_wait_days: p.new_wait_days } : {})
        };
        res = await fetch(`${API_BASE}/api/entities/${p.sequence_id}/edit-step`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
      } else throw new Error("Unknown proposal type: " + t);
      const data = await res.json();
      if (data.success) {
        setApplied({
          status: "success", type: t,
          entity_id: data.entity_id || data.campaign_id || p.sequence_id,
          entity_name: data.entity_name || data.campaign_name || p.sequence_name || p.name,
          updated_fields: data.updated_fields
        });
        await loadData();
      } else {
        setApplied({ status: "error", error: data.error || "Apply failed", hint: data.hint });
      }
    } catch (err) {
      setApplied({ status: "error", error: err.message });
    }
  };

  const cancelProposal = (idx) => {
    setChatMessages(prev => prev.map((m, i) => i === idx ? { ...m, proposal: null, applied: { status: "cancelled" } } : m));
  };

  const toggleEntityActive = async (ent) => {
    const id = ent.id;
    const endpoint = ent.active ? "pause" : "activate";
    setActionState(prev => ({ ...prev, [id]: "working" }));
    try {
      const res = await fetch(`${API_BASE}/api/entities/${id}/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setActionState(prev => ({ ...prev, [id]: "done" }));
        await loadData();
      } else {
        setActionState(prev => ({ ...prev, [id]: "error" }));
      }
    } catch {
      setActionState(prev => ({ ...prev, [id]: "error" }));
    }
  };

  const activeEntities = entities.filter(e => e.active);

  // Sum last N days of a metric across every sequence. Handles both shapes
  // {date, value} (current backend) and raw number (defensive).
  const aggregateRange = (metric, days) => {
    let total = 0, anyData = false;
    for (const id in trendsByEntity) {
      const series = trendsByEntity[id]?.series?.[metric];
      if (Array.isArray(series) && series.length > 0) {
        const slice = series.slice(-days);
        total += slice.reduce((a, v) => a + (Number(typeof v === "object" ? v?.value : v) || 0), 0);
        anyData = true;
      }
    }
    return anyData ? total : null;
  };

  const lifetime = entities.reduce((acc, e) => ({
    delivered: acc.delivered + (e.unique_delivered || 0),
    opened:    acc.opened    + (e.unique_opened    || 0),
    replied:   acc.replied   + (e.unique_replied   || 0)
  }), { delivered: 0, opened: 0, replied: 0 });

  const [kpiRange, setKpiRange] = useState(() => {
    try { return localStorage.getItem("atlas_kpi_range") || "today"; } catch { return "today"; }
  });
  const switchKpiRange = (r) => {
    setKpiRange(r);
    try { localStorage.setItem("atlas_kpi_range", r); } catch {}
  };

  // For delivered, prefer the source's rolling 24h/7d count when available;
  // snapshot-delta math lags until the next daily snapshot runs.
  const kpiValue = (metric) => {
    if (kpiRange === "lifetime") return lifetime[metric];
    let val;
    if (kpiRange === "today" && metric === "delivered" && sourceHealth?.summary?.delivered_last_24h !== undefined) {
      val = sourceHealth.summary.delivered_last_24h;
    } else if (kpiRange === "7d" && metric === "delivered" && sourceHealth?.summary?.delivered_last_7d !== undefined) {
      val = sourceHealth.summary.delivered_last_7d;
    } else {
      const days = kpiRange === "today" ? 1 : kpiRange === "7d" ? 7 : 30;
      val = aggregateRange(metric, days);
    }
    // A time window can never exceed all-time. Clamp so the headline never shows
    // the impossible "30 days > lifetime" (from summing clamped daily deltas on
    // non-monotonic counters). Only clamp when we have a lifetime number.
    const lt = lifetime[metric];
    if (val != null && typeof lt === "number" && lt > 0) return Math.min(val, lt);
    return val;
  };

  // Coverage: best-case captured-days across any sequence in the chosen window.
  const coverage = (() => {
    const want = kpiRange === "today" ? 1 : kpiRange === "7d" ? 7 : kpiRange === "30d" ? 30 : null;
    if (want === null) return null;
    let captured = 0;
    for (const id in trendsByEntity) {
      const dc = trendsByEntity[id]?.daysCovered;
      if (!dc) continue;
      const c = kpiRange === "today" ? dc.today : kpiRange === "7d" ? dc.d7 : dc.d30;
      if (c > captured) captured = c;
    }
    return { captured, want };
  })();

  const kpiLabel = (() => {
    if (kpiRange === "today") return "Today";
    if (kpiRange === "lifetime") return "Lifetime";
    if (!coverage) return kpiRange === "7d" ? "7 Days" : "30 Days";
    if (coverage.captured >= coverage.want) return kpiRange === "7d" ? "7 Days" : "30 Days";
    return `${coverage.captured}/${coverage.want} Days`;
  })();

  // Persistent header banner uses overall source-health rollup
  const systemBanner = (() => {
    if (!sourceHealth) return null;
    const status = sourceHealth.overall_status;
    if (status === "healthy") {
      return { color: colors.green, label: "ALL SYSTEMS HEALTHY", sub: "Data source connected · no active issues" };
    }
    if (status === "needs_attention") {
      const fc = sourceHealth?.summary?.finding_counts || {};
      const w = fc.warning || 0, a = fc.alert || 0;
      return { color: colors.amber, label: "NEEDS ATTENTION", sub: `${a + w} finding${a + w === 1 ? "" : "s"} flagged · review below` };
    }
    if (status === "critical") {
      return { color: colors.red, label: "CRITICAL", sub: "Source-health issues detected · action required" };
    }
    return { color: colors.textMuted, label: status?.toUpperCase() || "—", sub: "" };
  })();

  const filteredEntities = entities.filter(e => {
    if (campaignFilter === "active") return e.active;
    if (campaignFilter === "draft") return !e.active && !e.archived;
    return true;
  });

  const refreshedAt = lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";

  const css = `
    body { background: ${colors.bg}; color: ${colors.text}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; }
    .tabs::-webkit-scrollbar { display: none; }
  `;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text, paddingBottom: 80 }}>
      <style>{css}</style>

      <div style={{ padding: "14px 14px 0", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, letterSpacing: 0.2 }}>
              {CLIENT.brandPrefix} <span style={{ color: colors.cyan }}>{CLIENT.brandAccent}</span> {CLIENT.brandSuffix}
            </div>
            <div style={{ fontSize: 11, color: colors.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{CLIENT.tagline}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 10, color: colors.textMuted, textAlign: "right", lineHeight: 1.2 }}>
              <div style={{ color: colors.textDim, fontWeight: 500 }}>Updated</div>
              <div>{refreshedAt}</div>
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              style={{ background: colors.cyan, color: "#062423", border: 0, padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="tabs" style={{ display: "flex", gap: 0, padding: "0 4px", overflowX: "auto", marginTop: 8 }}>
          {[
            { id: "dashboard",  label: "Dashboard" },
            { id: "plan",       label: "90-Day Plan" },
            { id: "competitor", label: "Competitor Intel" },
            { id: "kb",         label: "Knowledge Base" }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              style={{
                flexShrink: 0, padding: "12px 14px 10px",
                color: activeTab === t.id ? colors.cyan : colors.textMuted,
                fontSize: 13, fontWeight: 500, border: 0, background: "transparent",
                borderBottom: `2px solid ${activeTab === t.id ? colors.cyan : "transparent"}`,
                cursor: "pointer", whiteSpace: "nowrap"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Persistent banner — critical alerts override the system-health
          state so issues are visible on every tab. Tap to jump to Dashboard. */}
      {(() => {
        const alertCount = sourceHealth?.summary?.finding_counts?.alert || 0;
        const warnCount  = sourceHealth?.summary?.finding_counts?.warning || 0;
        if (alertCount > 0) {
          return (
            <div
              onClick={() => switchTab("dashboard")}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px",
                background: "linear-gradient(90deg, #3a1010 0%, #1f0606 100%)",
                borderBottom: `2px solid ${colors.red}`,
                fontSize: 12, cursor: "pointer"
              }}
            >
              <span style={{ background: colors.red, color: "#fff", fontWeight: 700, padding: "3px 8px", borderRadius: 4, fontSize: 10, letterSpacing: 0.4, flexShrink: 0 }}>
                🚨 {alertCount} CRITICAL ALERT{alertCount === 1 ? "" : "S"}
              </span>
              <span style={{ color: colors.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Tap to view on Dashboard · {warnCount > 0 ? `${warnCount} warning${warnCount === 1 ? "" : "s"} also active` : "needs immediate attention"}
              </span>
              <span style={{ color: colors.textDim, fontSize: 11, flexShrink: 0 }}>▸</span>
            </div>
          );
        }
        if (warnCount > 0) {
          return (
            <div
              onClick={() => switchTab("dashboard")}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px",
                background: "linear-gradient(90deg, #3a2a08 0%, #1f1604 100%)",
                borderBottom: `1px solid ${colors.amber}`,
                fontSize: 12, cursor: "pointer"
              }}
            >
              <span style={{ background: colors.amber, color: "#1a0f0a", fontWeight: 700, padding: "3px 8px", borderRadius: 4, fontSize: 10, letterSpacing: 0.4, flexShrink: 0 }}>
                ⚠ {warnCount} WARNING{warnCount === 1 ? "" : "S"}
              </span>
              <span style={{ color: colors.textDim, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Tap to view on Dashboard
              </span>
              <span style={{ color: colors.textDim, fontSize: 11, flexShrink: 0 }}>▸</span>
            </div>
          );
        }
        if (systemBanner) {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "linear-gradient(90deg, #0c1d36 0%, #0a1628 100%)", borderBottom: `1px solid ${colors.border}`, fontSize: 12 }}>
              <span style={{ background: systemBanner.color, color: "#062423", fontWeight: 700, padding: "3px 8px", borderRadius: 4, fontSize: 10, letterSpacing: 0.4, flexShrink: 0 }}>
                {systemBanner.label}
              </span>
              <span style={{ color: colors.textDim, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {systemBanner.sub}
              </span>
            </div>
          );
        }
        return null;
      })()}

      {error && (
        <div style={{ margin: "12px 14px 0", background: "rgba(239,68,68,0.1)", border: `1px solid ${colors.red}`, borderRadius: 8, padding: "10px 12px", color: colors.red, fontSize: 12 }}>
          Error: {error}
        </div>
      )}

      <div style={{ padding: "14px 12px", maxWidth: 1200, margin: "0 auto" }}>

        {activeTab === "dashboard" && (
          <>
            {insight && (
              <div style={{ background: "rgba(34,211,238,0.08)", border: `1px solid ${colors.cyan}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ color: colors.cyan, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>INSIGHT</div>
                <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 3 }}>{insight.headline}</div>
                {insight.detail && <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5 }}>{insight.detail}</div>}
              </div>
            )}

            {/* KPI time-range toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Activity · {kpiLabel}
              </div>
              <div style={{ display: "flex", background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 3 }}>
                {[
                  { val: "today",    label: "Today" },
                  { val: "7d",       label: "7 Days" },
                  { val: "30d",      label: "30 Days" },
                  { val: "lifetime", label: "Lifetime" }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => switchKpiRange(opt.val)}
                    style={{
                      background: kpiRange === opt.val ? colors.cyan : "transparent",
                      color: kpiRange === opt.val ? "#062423" : colors.textDim,
                      border: 0, padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
              {(() => {
                const fmt = (v) => v === null || v === undefined ? "—" : Number(v).toLocaleString();
                const dv = kpiValue("delivered"), ov = kpiValue("opened"), rv = kpiValue("replied");
                return <>
                  <KpiTile label={`Delivered · ${kpiLabel}`} value={fmt(dv)} sub={kpiRange !== "lifetime" ? `${lifetime.delivered.toLocaleString()} all-time` : null} accent={colors.text} />
                  <KpiTile label={`Opens · ${kpiLabel}`}     value={fmt(ov)} sub={kpiRange !== "lifetime" ? `${lifetime.opened.toLocaleString()} all-time` : null}    accent={colors.blue} />
                  <KpiTile label={`Replies · ${kpiLabel}`}   value={fmt(rv)} sub={kpiRange !== "lifetime" ? `${lifetime.replied.toLocaleString()} all-time` : null}   accent={colors.green} />
                </>;
              })()}
              <KpiTile label="Active Sequences" value={activeEntities.length} sub={`of ${entities.length} total`} accent={colors.cyan} />
              <KpiTile
                label="System Health"
                value={sourceHealth?.overall_status === "healthy" ? "OK" : sourceHealth?.overall_status === "needs_attention" ? "WATCH" : sourceHealth?.overall_status === "critical" ? "ALERT" : "—"}
                sub={sourceHealth ? `${sourceHealth?.summary?.active_sequences ?? 0} active / ${sourceHealth?.summary?.total_sequences ?? 0}` : "loading"}
                accent={sourceHealth?.overall_status === "healthy" ? colors.green : sourceHealth?.overall_status === "critical" ? colors.red : colors.amber}
              />
              <KpiTile
                label="Reply Inbox"
                value="—"
                sub="needs Apollo tagging"
                accent={colors.textMuted}
                tooltip="Apollo API doesn't expose unread reply counts cleanly. Roadmap item."
              />
            </div>

            {sourceHealth && (sourceHealth.findings || []).length > 0 && (() => {
              const sevMeta = {
                alert:   { color: colors.red,   label: "ALERT",   bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.35)" },
                warning: { color: colors.amber, label: "WARNING", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)" },
                info:    { color: colors.blue,  label: "INFO",    bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.35)" }
              };
              const findings = (sourceHealth.findings || []).slice().sort((a, b) => {
                const order = { alert: 0, warning: 1, info: 2 };
                return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
              });
              return (
                <Section title="Source Health">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {findings.map((f, i) => {
                      const m = sevMeta[f.severity] || sevMeta.info;
                      const isOpen = expandedFinding === i;
                      return (
                        <div
                          key={i}
                          onClick={() => setExpandedFinding(isOpen ? null : i)}
                          style={{ background: m.bg, border: `1px solid ${m.border}`, borderLeft: `3px solid ${m.color}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ color: m.color, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>{m.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{f.title}</span>
                            <span style={{ color: colors.textMuted, fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                          </div>
                          {isOpen && <div style={{ color: colors.textDim, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{f.detail}</div>}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              );
            })()}

            <Section
              title="Sequence Performance"
              right={
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { val: "all", label: `All (${entities.length})` },
                    { val: "active", label: `Active (${activeEntities.length})` },
                    { val: "draft", label: "Draft" }
                  ].map(f => (
                    <button
                      key={f.val}
                      onClick={() => setCampaignFilter(f.val)}
                      style={{
                        background: campaignFilter === f.val ? "rgba(34,211,238,0.15)" : "transparent",
                        border: `1px solid ${campaignFilter === f.val ? colors.cyan : colors.border}`,
                        color: campaignFilter === f.val ? colors.cyan : colors.textDim,
                        fontSize: 10, padding: "3px 8px", borderRadius: 10, fontWeight: 600, cursor: "pointer"
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              }
            >
              {entities.length === 0 ? (
                <div style={{ background: colors.bgCard, border: `1px dashed ${colors.borderBright}`, borderRadius: 10, padding: "30px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>No sequences yet</div>
                  <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5 }}>
                    Create a sequence in Apollo with the <code style={{ color: colors.cyan }}>atlas-</code> prefix and it will appear here.
                  </div>
                </div>
              ) : (
                <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px 56px", gap: 8, padding: "10px 12px", background: colors.bgElevated, fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                    <div>Sequence</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                    <div style={{ textAlign: "right" }}>Sent</div>
                    <div style={{ textAlign: "right" }}>Open%</div>
                  </div>
                  {filteredEntities.length === 0 ? (
                    <div style={{ padding: "20px 12px", textAlign: "center", color: colors.textMuted, fontSize: 12 }}>No sequences match this filter.</div>
                  ) : filteredEntities.map(ent => {
                    const openPct = (ent.open_rate || 0) * 100;
                    const openColor = !ent.unique_delivered ? colors.textMuted
                      : openPct >= 20 ? colors.green : openPct >= 10 ? colors.amber : colors.red;
                    return (
                      <div key={ent.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px 56px", gap: 8, padding: "11px 12px", borderTop: `1px solid ${colors.border}`, fontSize: 12, alignItems: "center" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.text }} title={ent.name}>{ent.name || "Untitled"}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textAlign: "center", letterSpacing: 0.3,
                          background: ent.active ? "rgba(34,211,238,0.15)" : "rgba(138,160,189,0.12)",
                          color: ent.active ? colors.cyan : colors.textMuted }}>
                          {ent.active ? "ACTIVE" : "DRAFT"}
                        </div>
                        <div style={{ textAlign: "right", color: colors.textDim, fontVariantNumeric: "tabular-nums" }}>{(ent.unique_delivered || 0).toLocaleString()}</div>
                        <div style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: openColor }}>
                          {ent.unique_delivered ? openPct.toFixed(1) + "%" : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {entities.length > 0 && (
              <Section
                title={`Trend · ${trendRange === "weekly" ? "12 Weeks" : trendRange === "monthly" ? "12 Months" : "30 Days"}`}
                right={
                  <div style={{ display: "flex", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 2 }}>
                    {[{ val: "daily", label: "Daily" }, { val: "weekly", label: "Weekly" }, { val: "monthly", label: "Monthly" }].map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setTrendRange(opt.val)}
                        style={{
                          background: trendRange === opt.val ? colors.cyan : "transparent",
                          color: trendRange === opt.val ? "#062423" : colors.textDim,
                          border: "none", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer"
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                }
              >
                {entities.filter(e => e.active || (e.unique_delivered || 0) > 0).map(ent => {
                  const t = trendsByEntity[ent.id];
                  const opens = (t?.series?.opened || []).map(v => typeof v === "object" ? v.value : v);
                  const clicks = (t?.series?.clicked || []).map(v => typeof v === "object" ? v.value : v);
                  const replies = (t?.series?.replied || []).map(v => typeof v === "object" ? v.value : v);
                  const sliceLen = trendRange === "weekly" ? 12 : trendRange === "monthly" ? 12 : 30;
                  const hasAny = opens.length >= 2 || clicks.length >= 2 || replies.length >= 2;
                  return (
                    <div key={ent.id} style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
                        <div style={{ fontSize: 12, color: colors.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ent.name}</div>
                        {(() => {
                          const st = actionState[ent.id];
                          const working = st === "working";
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleEntityActive(ent); }}
                              disabled={working}
                              style={{
                                background: working ? colors.bgElevated : (ent.active ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)"),
                                color: working ? colors.textMuted : (ent.active ? colors.red : colors.green),
                                border: `1px solid ${working ? colors.border : (ent.active ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)")}`,
                                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                cursor: working ? "wait" : "pointer", whiteSpace: "nowrap", flexShrink: 0
                              }}
                            >
                              {working ? "..." : (ent.active ? "Pause" : "Activate")}
                            </button>
                          );
                        })()}
                      </div>
                      {hasAny ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <SparkCell label="Opens" data={opens.slice(-sliceLen)} color={colors.blue} />
                          <SparkCell label="Clicks" data={clicks.slice(-sliceLen)} color={colors.cyan} />
                          <SparkCell label="Replies" data={replies.slice(-sliceLen)} color={colors.green} />
                        </div>
                      ) : (
                        <div style={{ color: colors.textMuted, fontSize: 11, fontStyle: "italic" }}>
                          {t?.data_points === 1 ? "1 snapshot — sparklines populate after second daily snapshot." : "Not enough trend data yet."}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>
            )}
          </>
        )}

        {activeTab === "plan" && (
          <>
            <Section title="Atlas Build Status">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Alert tone="info" title="Dashboard infrastructure live">
                  Frontend on Netlify, backend on Render, Atlas-only sequence filter via <code>atlas-</code> name prefix in apollo-adapter. Shared Apollo account with BlueKey (saves $49/mo).
                </Alert>
                <Alert tone="info" title="Outreach domains purchased (2026-05-24)">
                  5 secondary domains registered on Namecheap, 1yr w/ auto-renew + privacy: <code>atlasaiconsulting.co</code>, <code>.net</code>, <code>.us</code>, <code>.site</code>, <code>.work</code>. Total $36.30.
                </Alert>
                <Alert tone="warning" title="Domain status: HQ vs outreach split">
                  <strong>atlasaigroup.ai = HQ only</strong> (real correspondence — never cold outreach). Cold outreach runs on the 5 secondary atlasaiconsulting domains.
                </Alert>
              </div>
            </Section>

            <Section title="Outstanding Follow-ups">
              <Timeline items={[
                {
                  date: "Step 1 · ~2 min",
                  status: "now",
                  title: "Update Netlify env vars",
                  detail: "VITE_CLIENT_NAME → 'Atlas AI Consulting Group', VITE_CLIENT_DESCRIPTION → 'From Insight to Impact — Atlas AI Consulting Group' (Netlify UI clicks)"
                },
                {
                  date: "Step 2 · ~30 min",
                  status: "now",
                  title: "Set up atlasaigroup.ai DNS",
                  detail: "Add MX + SPF records in Namecheap Advanced DNS, wait 4h propagation, then create the 5 HQ mailboxes (info@, david@, etc.)"
                },
                {
                  date: "Step 3 · ~1 hr",
                  status: "warn",
                  title: "Set up Namecheap Private Email for outreach domains",
                  detail: "5 Starter mailboxes (~$50/yr total). DNS values pre-drafted in atlas-handoff.md section D. DMARC must start at p=none."
                },
                {
                  date: "Step 4 · ~30 min",
                  status: "warn",
                  title: "Connect outreach mailboxes to Apollo via IMAP",
                  detail: "mail.privateemail.com 993/465 SSL. Steps in atlas-handoff.md D.5. Flip warm-up ON per mailbox; 2-4 weeks to mature."
                },
                {
                  date: "Step 5 · ~5 min",
                  status: "future",
                  title: "Re-enable Mailbox Health panel",
                  detail: "Set MAILBOX_DOMAIN_FILTER env on Render to the 5 atlasaiconsulting domains, flip FEATURES.mailboxHealth=true"
                },
                {
                  date: "Step 6 · ~5 min",
                  status: "future",
                  title: "Create Supabase tables",
                  detail: "sequence_snapshots + proposal_templates in Atlas's Supabase project. Paste-ready SQL in atlas-handoff.md section F."
                },
                {
                  date: "Step 7 · ~10 min",
                  status: "future",
                  title: "Set up daily snapshot cron on Render",
                  detail: "06:00 UTC, POST /api/snapshot/run. Steps in atlas-handoff.md section G."
                },
                {
                  date: "Step 8",
                  status: "future",
                  title: "First atlas- prefixed sequence",
                  detail: "Create your first sequence in Apollo with 'atlas-' prefix → dashboard begins showing real data"
                }
              ]} />
            </Section>
          </>
        )}

        {activeTab === "competitor" && (
          <CompetitorIntel apiBase={API_BASE} accent={colors.cyan} />
        )}

        {activeTab === "kb" && (
          <Section title="Apollo Gotchas — Field Notes">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <KbItem tags={["CRITICAL", "MAILBOX"]} title="Warm-up toggle silently reverts">
                Apollo's warm-up toggle can flip OFF on its own after being enabled. Verify by refreshing the page after every toggle change. Re-check weekly until all mailboxes are matured.
              </KbItem>
              <KbItem tags={["CRITICAL", "SEQUENCE"]} title="Never use Apollo AI Assistant to create sequences">
                AI Assistant sequences default to "Manual email" (drafts pile up, never send), carry a sticky <code>manual_approve</code> flag the API can't clear, and use AI variables that can vanish. Always create manually with static <code>{"{{first_name}}"}</code> / <code>{"{{company.name}}"}</code> variables.
              </KbItem>
              <KbItem tags={["MAILBOX"]} title="Mailbox rotation must be set at 'Add to Sequence' time">
                The rotate-mailboxes toggle is only exposed in the "Add N contacts" dialog. Contacts already added are locked to whichever mailbox they were added under. To change rotation: remove and re-add.
              </KbItem>
              <KbItem tags={["SAVED SEARCH"]} title="Always verify saved-search location filters before using">
                Apollo's location filters can silently drop. Spot-check 3-5 visible contact locations before pressing "Add to Sequence".
              </KbItem>
              <KbItem tags={["DEPLOY"]} title="Render auto-deploy can silently miss pushes">
                If a <code>git push</code> doesn't redeploy within 5 min, don't keep pushing. Go to Render dashboard → service → Manual Deploy → Deploy latest commit.
              </KbItem>
              <KbItem tags={["SEND BEHAVIOR"]} title="'Scheduled - Delayed' emails can lag 1-3h">
                Apollo's smart-send doesn't fire at exactly the scheduled time. Normal on Day 1 of a new sequence. Only flag if mailbox counter still 0/50 by end of business day.
              </KbItem>
              <KbItem tags={["DMARC"]} title="DMARC: start at p=none, never p=reject day one">
                When setting up DMARC for a new sending domain, start with <code>p=none</code> for 1-2 weeks of monitoring. Day-one <code>p=reject</code> caused a deliverability crisis on bluekeycrc.com — emails were silently dropped by receiving servers.
              </KbItem>
              <KbItem tags={["ARCHITECTURE"]} title="HQ domain vs outreach domain split">
                Never run cold outreach from your real business domain. Reserve <code>atlasaigroup.ai</code> for HQ correspondence (info@, david@, etc.). Cold outreach runs on separate rotation domains to protect HQ deliverability.
              </KbItem>
            </div>
          </Section>
        )}
      </div>

      {/* Floating Chat */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        style={{
          position: "fixed", bottom: 14, right: 14, width: 56, height: 56, borderRadius: "50%",
          background: colors.cyan, border: 0, color: "#062423", fontSize: 22, cursor: "pointer",
          boxShadow: "0 4px 16px rgba(34,211,238,0.4)", zIndex: 1000
        }}
        aria-label="Open chat"
      >
        {chatOpen ? "×" : "💬"}
      </button>

      {chatOpen && (
        <div style={{
          position: "fixed", bottom: 80, right: 14, width: "min(380px, calc(100vw - 28px))",
          height: "min(560px, calc(100vh - 120px))", background: colors.bgCard,
          border: `1px solid ${colors.border}`, borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)", zIndex: 999, display: "flex", flexDirection: "column", overflow: "hidden"
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.border}`, fontWeight: 600, color: colors.cyan }}>
            {CLIENT.assistantTitle}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {chatMessages.length === 0 && (
              <div style={{ color: colors.textDim, fontSize: 13 }}>{CLIENT.chatExamples}</div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 6 }}>
                {m.content && (
                  <div style={{
                    background: m.role === "user" ? colors.cyan : colors.bgElevated,
                    color: m.role === "user" ? "#062423" : colors.text,
                    padding: "8px 11px", borderRadius: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.4,
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start"
                  }}>{m.content}</div>
                )}
                {m.proposal && (!m.applied || m.applied.status !== "success") && (
                  <ProposalCard
                    proposal={m.proposal}
                    appliedState={m.applied}
                    preview={proposalPreviews[i] || null}
                    onApply={() => applyProposal(i)}
                    onCancel={() => cancelProposal(i)}
                  />
                )}
                {m.applied?.status === "success" && (
                  <div style={{ background: "rgba(34,197,94,0.10)", border: `1px solid ${colors.green}`, borderRadius: 8, padding: "8px 11px", fontSize: 12, color: colors.text }}>
                    <div style={{ color: colors.green, fontWeight: 600, marginBottom: 3 }}>
                      {m.applied.type === "pause_sequence" ? "Paused" :
                       m.applied.type === "archive_sequence" ? "Archived" :
                       m.applied.type === "edit_step" ? `Edited step (${(m.applied.updated_fields || []).join(" + ") || "updated"})` :
                       "Created in Apollo"}
                    </div>
                    <div style={{ color: colors.textDim, fontSize: 11 }}>{m.applied.entity_name}</div>
                  </div>
                )}
                {m.applied?.status === "cancelled" && (
                  <div style={{ color: colors.textMuted, fontSize: 11, fontStyle: "italic" }}>Proposal dismissed.</div>
                )}
              </div>
            ))}
            {chatLoading && <div style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>Thinking...</div>}
          </div>
          <div style={{ borderTop: `1px solid ${colors.border}`, padding: 8, display: "flex", gap: 6 }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
              placeholder={CLIENT.chatPlaceholder}
              style={{ flex: 1, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, padding: "8px 10px", fontSize: 13, outline: "none" }}
            />
            <button
              onClick={startVoiceInput}
              disabled={chatLoading || isListening}
              style={{ background: isListening ? colors.red : colors.bgElevated, color: "#fff", border: 0, borderRadius: 8, padding: "0 10px", fontSize: 16, cursor: chatLoading ? "not-allowed" : "pointer" }}
              aria-label="Voice input"
            >
              {isListening ? "🔴" : "🎤"}
            </button>
            <button
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              style={{ background: colors.cyan, color: "#062423", border: 0, borderRadius: 8, padding: "0 12px", fontSize: 13, fontWeight: 600, cursor: chatLoading ? "not-allowed" : "pointer", opacity: chatLoading ? 0.6 : 1 }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ SUB-COMPONENTS ============

const KpiTile = ({ label, value, sub, accent, tooltip }) => (
  <div title={tooltip} style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: accent || colors.text, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>{sub}</div>}
  </div>
);

const Section = ({ title, right, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {right}
    </div>
    {children}
  </div>
);

const SparkCell = ({ label, data, color }) => {
  const val = Array.isArray(data) && data.length > 0 ? data.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  return (
    <div style={{ background: colors.bgElevated, borderRadius: 6, padding: "6px 8px" }}>
      <div style={{ fontSize: 9, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, margin: "2px 0 4px" }}>{val}</div>
      <Sparkline data={data} color={color} width={100} height={18} />
    </div>
  );
};

const Alert = ({ tone, title, children }) => {
  const map = {
    alert: { border: colors.red, bg: "rgba(239,68,68,0.08)" },
    warning: { border: colors.amber, bg: "rgba(245,158,11,0.08)" },
    info: { border: colors.purple, bg: "rgba(167,139,250,0.08)" }
  };
  const m = map[tone] || map.info;
  return (
    <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderLeft: `3px solid ${m.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
};

const Timeline = ({ items }) => (
  <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
    {items.map((item, i) => {
      const dotColor = item.status === "now" ? colors.cyan : item.status === "warn" ? colors.amber : colors.textMuted;
      const dotShadow = item.status === "now" ? "rgba(34,211,238,0.15)" : item.status === "warn" ? "rgba(245,158,11,0.15)" : "rgba(138,160,189,0.1)";
      const dateColor = item.status === "now" ? colors.cyan : item.status === "warn" ? colors.amber : colors.textMuted;
      return (
        <div key={i} style={{ display: "flex", gap: 10, padding: i === 0 ? "0 0 10px" : i === items.length - 1 ? "10px 0 0" : "10px 0", borderBottom: i < items.length - 1 ? `1px solid ${colors.border}` : "none" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, marginTop: 5, flexShrink: 0, boxShadow: `0 0 0 3px ${dotShadow}` }} />
          <div>
            <div style={{ fontSize: 11, color: dateColor, fontWeight: 600, marginBottom: 3 }}>{item.date}</div>
            <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.5 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3 }}>{item.detail}</div>
          </div>
        </div>
      );
    })}
  </div>
);

const KbItem = ({ tags = [], title, children }) => (
  <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
    <div style={{ marginBottom: 6 }}>
      {tags.map((t, i) => (
        <span key={i} style={{ display: "inline-block", background: "rgba(167,139,250,0.15)", color: colors.purple, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: 0.3, marginRight: 5, marginBottom: 5, textTransform: "uppercase" }}>
          {t}
        </span>
      ))}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: colors.cyan, marginBottom: 6, lineHeight: 1.3 }}>{title}</div>
    <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5 }}>{children}</div>
  </div>
);

const ProposalCard = ({ proposal, appliedState, preview, onApply, onCancel }) => {
  const state = !appliedState ? "idle" : appliedState.status === "applying" ? "applying" : appliedState.status === "success" ? "applied" : appliedState.status === "error" ? "error" : "idle";
  const typeLabel =
    proposal.type === "create_sequence" ? "Create Sequence" :
    proposal.type === "pause_sequence" ? "Pause Sequence" :
    proposal.type === "archive_sequence" ? "Archive Sequence" :
    proposal.type === "edit_step" ? `Edit Step ${proposal.step_position || "?"}` :
    proposal.type || "Create Sequence";

  let overwriteWarning = null;
  if (proposal.type === "edit_step" && preview?.template) {
    const tpl = preview.template;
    const editingSubject = typeof proposal.new_subject === "string";
    const editingBody = typeof proposal.new_body_text === "string";
    const overS = editingSubject && tpl.ai_variables_in_subject;
    const overB = editingBody && tpl.ai_variables_in_body;
    if (overS || overB) {
      const areas = [overS ? "subject" : null, overB ? "body" : null].filter(Boolean).join(" and ");
      overwriteWarning = (
        <div style={{ background: "rgba(244,114,182,0.10)", border: "1px solid rgba(244,114,182,0.45)", borderRadius: 6, padding: "6px 8px", marginBottom: 8 }}>
          <div style={{ color: "#f472b6", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>AI PERSONALIZATION WILL BE OVERWRITTEN</div>
          <div style={{ color: colors.text, fontSize: 11, lineHeight: 1.4 }}>
            The {areas} of this step uses Apollo AI variables ({(tpl.ai_variables_detected || []).join(", ") || "AI generator"}). Applying replaces them with static text.
          </div>
        </div>
      );
    }
  }

  return (
    <div style={{ background: "rgba(34,211,238,0.08)", border: `1px solid ${colors.cyan}`, borderRadius: 10, padding: 10, marginTop: 4 }}>
      <div style={{ color: colors.cyan, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 5 }}>
        Proposed: {typeLabel}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>{proposal.name || proposal.sequence_name}</div>
      {overwriteWarning}
      {proposal.type === "edit_step" && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 8px", marginBottom: 8 }}>
          {typeof proposal.new_subject === "string" && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: colors.textMuted, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, marginBottom: 3 }}>NEW SUBJECT</div>
              <div style={{ color: colors.text, fontSize: 12 }}>{proposal.new_subject}</div>
            </div>
          )}
          {typeof proposal.new_body_text === "string" && (
            <div style={{ marginBottom: Number.isInteger(proposal.new_wait_days) ? 6 : 0 }}>
              <div style={{ color: colors.textMuted, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, marginBottom: 3 }}>NEW BODY</div>
              <div style={{ color: colors.text, fontSize: 12, whiteSpace: "pre-wrap", maxHeight: "10rem", overflowY: "auto" }}>{proposal.new_body_text}</div>
            </div>
          )}
          {Number.isInteger(proposal.new_wait_days) && (
            <div>
              <div style={{ color: colors.textMuted, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, marginBottom: 3 }}>NEW WAIT</div>
              <div style={{ color: colors.text, fontSize: 12 }}>{proposal.new_wait_days} day{proposal.new_wait_days === 1 ? "" : "s"}</div>
            </div>
          )}
        </div>
      )}
      {proposal.summary && (
        <div style={{ color: colors.textDim, fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{proposal.summary}</div>
      )}
      {state === "error" && (
        <div style={{ color: colors.red, fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
          <div>Error: {appliedState?.error || "Failed"}</div>
          {appliedState?.hint && <div style={{ color: colors.textMuted, marginTop: 3 }}>{appliedState.hint}</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button
          onClick={onApply}
          disabled={state === "applying" || state === "applied"}
          style={{
            background: state === "applied" ? colors.green : colors.cyan,
            color: "#062423", border: 0, borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600,
            cursor: (state === "applying" || state === "applied") ? "wait" : "pointer", flex: 1
          }}
        >
          {state === "applying" ? "Applying..." : state === "applied" ? "✓ Applied" : "Apply"}
        </button>
        <button
          onClick={onCancel}
          disabled={state === "applying"}
          style={{
            background: "transparent", color: colors.textDim, border: `1px solid ${colors.border}`,
            borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: state === "applying" ? "not-allowed" : "pointer"
          }}
        >
          {state === "applied" ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
};

// ============ COMPETITOR INTEL ============
// Self-contained component: loads /api/competitors, manages add-form state,
// supports auto-fill from URL via /api/competitors/scrape.

const CompetitorIntel = ({ apiBase, accent }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupHint, setSetupHint] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", positioning: "", claims: "", differentiator: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState(null);

  const load = async () => {
    try {
      const r = await fetch(`${apiBase}/api/competitors`);
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        setError(errBody.error || `HTTP ${r.status}`);
        setItems([]);
        return;
      }
      const data = await r.json();
      setItems(data.competitors || []);
      setSetupRequired(!!data.setup_required);
      setSetupHint(data.hint || "");
      setError(null);
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ name: "", url: "", positioning: "", claims: "", differentiator: "", notes: "" });

  const submit = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await r.json();
      if (!data.success) { setError(data.error || "Save failed"); return; }
      setShowForm(false);
      resetForm();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    try {
      const r = await fetch(`${apiBase}/api/competitors/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!data.success) { setError(data.error || "Delete failed"); return; }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const scrape = async () => {
    if (!form.url.trim()) { setScrapeError("Enter a URL first"); return; }
    setScraping(true);
    setScrapeError(null);
    try {
      const r = await fetch(`${apiBase}/api/competitors/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url.trim() })
      });
      const data = await r.json();
      if (!data.success) { setScrapeError(data.error || "Scrape failed"); return; }
      const d = data.draft || {};
      setForm(prev => ({
        ...prev,
        name: prev.name || d.name || "",
        positioning: d.positioning || prev.positioning,
        claims: d.claims || prev.claims,
        differentiator: d.differentiator || prev.differentiator
      }));
    } catch (e) {
      setScrapeError(e.message);
    } finally {
      setScraping(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 3 }}>Competitor Intel</div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.4, maxWidth: 540 }}>
            Add competitors here. Their positioning and your differentiator are injected into every sequence / email draft the chat generates.
          </div>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setScrapeError(null); }}
          style={{ background: showForm ? "transparent" : accent, color: showForm ? colors.textDim : "#062423", border: `1px solid ${showForm ? colors.border : accent}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {showForm ? "Cancel" : "+ Add Competitor"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: colors.bgCard, border: `1px solid ${accent}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <CompetitorField label="Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="e.g. Accenture" />
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <CompetitorField label="Website URL" value={form.url} onChange={v => setForm({ ...form, url: v })} placeholder="https://..." />
            </div>
            <button
              onClick={scrape}
              disabled={scraping || !form.url.trim()}
              style={{ background: scraping ? colors.bgElevated : "transparent", color: scraping ? colors.textMuted : accent, border: `1px solid ${scraping ? colors.border : accent}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: (scraping || !form.url.trim()) ? "wait" : "pointer", whiteSpace: "nowrap", marginBottom: 10, opacity: !form.url.trim() ? 0.5 : 1 }}
              title="Fetch the URL and have Claude pre-fill positioning, claims, and differentiator"
            >
              {scraping ? "Reading..." : "Auto-fill from URL"}
            </button>
          </div>
          {scrapeError && <div style={{ color: colors.red, fontSize: 11, marginBottom: 8 }}>{scrapeError}</div>}
          <CompetitorField label="Positioning" value={form.positioning} onChange={v => setForm({ ...form, positioning: v })} multiline placeholder="1-2 sentences: how they describe themselves" />
          <CompetitorField label="Their claims (bulleted)" value={form.claims} onChange={v => setForm({ ...form, claims: v })} multiline rows={4} placeholder="3-5 short value props they promote, one per line" />
          <CompetitorField label="How we win" value={form.differentiator} onChange={v => setForm({ ...form, differentiator: v })} multiline placeholder="1-2 sentences: the contrast point chat will use" />
          <CompetitorField label="Notes (internal only)" value={form.notes} onChange={v => setForm({ ...form, notes: v })} multiline rows={2} placeholder="Anything else worth remembering" />
          {error && <div style={{ color: colors.red, fontSize: 11, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              onClick={submit}
              disabled={saving || !form.name.trim()}
              style={{ background: accent, color: "#062423", border: 0, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", flex: 1, opacity: !form.name.trim() ? 0.5 : 1 }}
            >
              {saving ? "Saving..." : "Save Competitor"}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); setError(null); }}
              style={{ background: "transparent", color: colors.textDim, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {items === null ? (
        <div style={{ color: colors.textMuted, fontSize: 12, padding: 16, textAlign: "center" }}>Loading...</div>
      ) : setupRequired ? (
        <div style={{ background: colors.bgCard, border: `1px solid ${colors.amber}`, borderLeft: `3px solid ${colors.amber}`, borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 13, color: colors.amber, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" }}>One-time setup required</div>
          <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5, marginBottom: 8 }}>
            {setupHint}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5 }}>
            Open your Atlas Supabase dashboard → SQL Editor → New query → paste the contents of <code style={{ color: colors.cyan }}>competitor-intel-supabase.sql</code> (in the BlueKey project root) → click Run. Then refresh this tab.
          </div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ background: colors.bgCard, border: `1px dashed ${colors.borderBright}`, borderRadius: 10, padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 5 }}>No competitors yet</div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5, maxWidth: 460, margin: "0 auto" }}>
            Add a few of the competitors prospects are most likely talking to. The chat will start contrasting against them automatically in every new sequence.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(c => (
            <div key={c.id} style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: accent, marginBottom: 2 }}>{c.name}</div>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: colors.textDim, textDecoration: "underline", wordBreak: "break-all" }}>
                      {c.url}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => remove(c.id, c.name)}
                  style={{ background: "transparent", color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  title="Delete competitor"
                >
                  Delete
                </button>
              </div>
              {c.positioning && <CompetitorBlock label="POSITIONING" body={c.positioning} />}
              {c.claims && <CompetitorBlock label="THEIR CLAIMS" body={c.claims} mono />}
              {c.differentiator && <CompetitorBlock label="HOW WE WIN" body={c.differentiator} accent={accent} />}
              {c.notes && <CompetitorBlock label="NOTES" body={c.notes} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CompetitorField = ({ label, value, onChange, multiline, rows = 2, placeholder }) => {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <Tag
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        style={{
          width: "100%", background: colors.bg, border: `1px solid ${colors.border}`,
          borderRadius: 6, color: colors.text, padding: "8px 10px", fontSize: 13,
          outline: "none", fontFamily: "inherit", lineHeight: multiline ? 1.5 : 1.2,
          boxSizing: "border-box", resize: multiline ? "vertical" : "none"
        }}
      />
    </div>
  );
};

const CompetitorBlock = ({ label, body, mono, accent }) => (
  <div style={{ marginTop: 6 }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: accent || colors.textMuted, letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: mono ? "ui-monospace, Menlo, monospace" : "inherit" }}>{body}</div>
  </div>
);

export default App;
