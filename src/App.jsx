import { useState, useEffect } from "react";
import "./index.css";
import { colors } from "./theme";
import clientConfig from "./clientConfig";
import { AtlasMark } from "./components/AtlasMark";
import { StatCard } from "./components/StatCard";
import { Bar } from "./components/Bar";
import { Sparkline } from "./components/Sparkline";
import { InsightBanner } from "./components/InsightBanner";
import { ProposalTray } from "./components/ProposalTray";
import { MailboxHealth } from "./components/MailboxHealth";
import { HealthPanel } from "./components/HealthPanel";
import { ReadinessScorecard } from "./components/ReadinessScorecard";

// ============================================================================
// CUSTOMIZE PER CLIENT — most per-client knobs live in ./clientConfig.js.
// The CLIENT object below holds the visible-copy strings that aren't worth a
// config import (header, tagline, chat placeholders). Edit either as needed.
// Backend URL comes from VITE_API_BASE in .env (set by Netlify per-client).
// ============================================================================
const API_BASE = import.meta.env.VITE_API_BASE || "https://CLIENT-backend.onrender.com";

const CLIENT = {
  // Header — appears at top of dashboard. Renders as: prefix <accent> suffix,
  // with <accent> in cyan. Here: "Atlas AI Consulting Group" (Consulting highlighted).
  brandPrefix: "Atlas AI",
  brandAccent: "Consulting",
  brandSuffix: " Group",
  tagline: "From Insight to Impact",

  // Domain terminology — Atlas's data source is Apollo, entities are sequences
  entityNamePlural: "Sequences",
  entityNameSingular: "Sequence",

  // Chat widget
  assistantTitle: "Atlas Assistant",
  chatPlaceholder: "Ask about your sequences...",
  chatExamples: 'Examples: "What\'s heating up?" or "Which sequence is performing best?"',

  // Used in the ProposalTray success message after a write completes
  dataSourceLabel: "Apollo",

  // Rate bars rendered on each entity card. Set to [] to hide entirely
  // (e.g., for non-engagement-rate data sources like GitHub repos).
  rateMetrics: [
    { key: "open_rate",  label: "OPEN",  color: "blue",  scale: 100, decimals: 1 },
    { key: "click_rate", label: "CLICK", color: "cyan",  scale: 100, decimals: 1 },
    { key: "reply_rate", label: "REPLY", color: "green", scale: 5,   decimals: 2 }
  ]
};

// ============================================================================
// Components are imported from ./components/. Theme constants from ./theme.
// KPI tiles, panel rendering, and sparkline grid are driven by clientConfig.
// ============================================================================

function App() {
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
  const [insightLoading, setInsightLoading] = useState(false);

  // === Backported state (2026-05-17) ===
  const [sourceHealth, setSourceHealth] = useState(null);
  const [mailboxSummary, setMailboxSummary] = useState(null);
  const [readiness, setReadiness] = useState(null);
  // proposalPreviews: map of messageIndex -> previewStep() response (for AI-var warning)
  const [proposalPreviews, setProposalPreviews] = useState({});

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const healthRes = await fetch(`${API_BASE}/api/health`);
      const healthData = await healthRes.json();
      setHealth(healthData.status === "ok" ? "connected" : "error");

      const entRes = await fetch(`${API_BASE}/api/entities`);
      const entData = await entRes.json();
      const ents = entData.entities || entData.emailer_campaigns || [];
      setEntities(ents);
      setLastRefresh(new Date());

      setInsightLoading(true);
      fetch(`${API_BASE}/api/insights`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(data => {
          if (data && data.headline) setInsight(data);
        })
        .finally(() => setInsightLoading(false));

      // === Backported: Source Health (non-blocking)
      if (clientConfig.FEATURES?.healthPanel) {
        fetch(`${API_BASE}/api/health/source`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setSourceHealth(d); })
          .catch(() => {});
      }

      // === Backported: Mailbox summary (non-blocking)
      if (clientConfig.FEATURES?.mailboxHealth) {
        fetch(`${API_BASE}/api/mailboxes/summary`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d && d.success) setMailboxSummary(d); })
          .catch(() => {});
      }

      // === Backported: Readiness scorecard (opt-in, non-blocking)
      if (clientConfig.FEATURES?.stormReadiness) {
        fetch(`${API_BASE}/api/readiness`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setReadiness(d); })
          .catch(() => {});
      }
    } catch (err) {
      setError(err.message);
      setHealth("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entities.length === 0) return;
    let cancelled = false;
    Promise.all(
      entities.map(e =>
        fetch(`${API_BASE}/api/trends/${e.id}?range=${trendRange}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(t => [e.id, t])
      )
    ).then(results => {
      if (cancelled) return;
      const map = {};
      for (const [id, t] of results) if (t) map[id] = t;
      setTrendsByEntity(map);
    });
    return () => { cancelled = true; };
  }, [entities, trendRange]);

  // === Backported: edit_step pre-flight. For any chat message with an
  // edit_step proposal, fetch the current step content + AI-variable detection
  // so ProposalTray can warn the user before they overwrite AI personalization.
  useEffect(() => {
    let cancelled = false;
    chatMessages.forEach((m, idx) => {
      if (!m.proposal) return;
      if (m.proposal.type !== "edit_step") return;
      if (!m.proposal.sequence_id || !m.proposal.step_position) return;
      if (proposalPreviews[idx] !== undefined) return; // already fetched
      fetch(`${API_BASE}/api/entities/${m.proposal.sequence_id}/step/${m.proposal.step_position}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled || !data) return;
          setProposalPreviews(prev => ({ ...prev, [idx]: data }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [chatMessages, proposalPreviews]);

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported in this browser. Try Safari or Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(transcript);
      sendMessage(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const applyProposal = async (messageIndex) => {
    const msg = chatMessages[messageIndex];
    if (!msg || !msg.proposal || msg.applied) return;
    const proposal = msg.proposal;
    const updateMsg = (patch) => {
      setChatMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, ...patch } : m));
    };
    updateMsg({ applied: { status: "applying" } });
    try {
      const t = proposal.type || "create_sequence"; // legacy (no type) = create
      let res;
      if (t === "create_sequence") {
        res = await fetch(`${API_BASE}/api/entities/create-from-proposal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proposal)
        });
      } else if (t === "pause_sequence") {
        res = await fetch(`${API_BASE}/api/entities/${proposal.sequence_id}/pause`, { method: "POST" });
      } else if (t === "archive_sequence") {
        res = await fetch(`${API_BASE}/api/entities/${proposal.sequence_id}/archive`, { method: "POST" });
      } else if (t === "edit_step") {
        const body = {
          step_position: proposal.step_position,
          ...(typeof proposal.new_subject === "string" ? { new_subject: proposal.new_subject } : {}),
          ...(typeof proposal.new_body_text === "string" ? { new_body_text: proposal.new_body_text } : {}),
          ...(Number.isInteger(proposal.new_wait_days) ? { new_wait_days: proposal.new_wait_days } : {})
        };
        res = await fetch(`${API_BASE}/api/entities/${proposal.sequence_id}/edit-step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } else {
        throw new Error(`Unknown proposal type: ${t}`);
      }
      const data = await res.json();
      if (data.success) {
        updateMsg({
          applied: {
            status: "success",
            type: t,
            entity_id: data.entity_id || data.campaign_id || proposal.sequence_id,
            entity_name: data.entity_name || data.campaign_name || proposal.sequence_name || proposal.name,
            updated_fields: data.updated_fields
          }
        });
        await loadData();
      } else {
        updateMsg({ applied: { status: "error", error: data.error || "Apply failed", hint: data.hint } });
      }
    } catch (err) {
      updateMsg({ applied: { status: "error", error: err.message } });
    }
  };

  const cancelProposal = (messageIndex) => {
    setChatMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, proposal: null, applied: { status: "cancelled" } } : m));
  };

  const sendChat = () => sendMessage(chatInput);
  useEffect(() => { loadData(); }, []);

  const activeEntities = entities.filter(e => e.active);

  // === Backported: aggregate the latest-day delta across all entities for a metric.
  const aggregateDaily = (metric) => {
    let total = 0;
    let anyData = false;
    for (const seqId in trendsByEntity) {
      const series = trendsByEntity[seqId]?.series?.[metric];
      if (Array.isArray(series) && series.length > 0) {
        const last = series[series.length - 1];
        total += Number(typeof last === "object" ? last.value : last) || 0;
        anyData = true;
      }
    }
    return anyData ? total : null;
  };

  // Map per-message applied.status into the new ProposalTray's state vocab.
  const statusToProposalState = (applied) => {
    if (!applied) return "idle";
    if (applied.status === "applying") return "applying";
    if (applied.status === "success")  return "applied";
    if (applied.status === "error")    return "error";
    return "idle";
  };

  const todayShort = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text, fontFamily: "system-ui, sans-serif", padding: "clamp(1rem, 3vw, 2rem)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem", paddingBottom: "1.25rem", borderBottom: `1px solid ${colors.panelBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: "1 1 auto" }}>
            <AtlasMark />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: "clamp(1.1rem, 4vw, 1.75rem)", margin: 0, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                {CLIENT.brandPrefix} <span style={{ color: colors.cyan }}>{CLIENT.brandAccent}</span>{CLIENT.brandSuffix ? ` ${CLIENT.brandSuffix}` : ""}
              </h1>
              <p style={{ color: colors.textDim, margin: "0.25rem 0 0", fontSize: "0.75rem" }}>{CLIENT.tagline}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: colors.textDim }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: health === "connected" ? colors.green : colors.red, flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap" }}>{health === "connected" ? "Connected" : "Offline"}</span>
            </div>
            <button onClick={loadData} disabled={loading} style={{ background: colors.cyan, color: colors.bg, border: "none", padding: "0.45rem 0.9rem", borderRadius: 6, cursor: loading ? "wait" : "pointer", fontWeight: 600, fontSize: "0.8rem" }}>
              {loading ? "..." : "Refresh"}
            </button>
          </div>
        </header>

        {error && <div style={{ background: "rgba(248,113,113,0.1)", border: `1px solid ${colors.red}`, borderRadius: 8, padding: "0.85rem", marginBottom: "1.25rem", color: colors.red, fontSize: "0.85rem" }}>Error: {error}</div>}

        <InsightBanner insight={insight} loading={insightLoading} loadingLabel={CLIENT.entityNamePlural.toLowerCase()} />

        {/* === Backported panels (opt-in via clientConfig.FEATURES) === */}
        {clientConfig.FEATURES?.stormReadiness && readiness && (
          <ReadinessScorecard
            title="Storm Readiness"
            verdict={readiness.verdict}
            passed={readiness.passed}
            total={readiness.total}
            checks={readiness.checks}
          />
        )}
        {clientConfig.FEATURES?.mailboxHealth && (
          <MailboxHealth mailboxSummary={mailboxSummary} />
        )}
        {clientConfig.FEATURES?.healthPanel && (
          <HealthPanel sourceHealth={sourceHealth} />
        )}

        {/* === Backported: Daily-deltas KPI tiles, driven by clientConfig.kpiMetrics === */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {(clientConfig.kpiMetrics || []).map(m => {
            let value;
            if (m.key === "active") {
              value = activeEntities.length;
            } else {
              const d = aggregateDaily(m.key);
              value = d === null ? "—" : d.toLocaleString();
            }
            const accent = colors[m.accent] || colors.text;
            return <StatCard key={m.key} label={m.label} value={value} accent={accent} />;
          })}
        </div>

        <div style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1rem", margin: 0, fontWeight: 600 }}>{CLIENT.entityNamePlural} ({entities.length})</h2>
            <div style={{ display: "flex", background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, padding: 2 }} role="group" aria-label="Trend range">
              {[
                { val: "daily",   label: "Daily" },
                { val: "weekly",  label: "Weekly" },
                { val: "monthly", label: "Monthly" }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setTrendRange(opt.val)}
                  aria-pressed={trendRange === opt.val}
                  style={{
                    background: trendRange === opt.val ? colors.cyan : "transparent",
                    color: trendRange === opt.val ? colors.bg : colors.textDim,
                    border: "none",
                    padding: "0.3rem 0.65rem",
                    borderRadius: 4,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    letterSpacing: "0.02em"
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {loading && entities.length === 0 ? (
            <div style={{ color: colors.textDim, padding: "2rem", textAlign: "center" }}>Loading {CLIENT.entityNamePlural.toLowerCase()}...</div>
          ) : entities.length === 0 ? (
            <div style={{ color: colors.textDim, padding: "2rem", textAlign: "center" }}>No {CLIENT.entityNamePlural.toLowerCase()} found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {entities.map(ent => (
                <div key={ent.id} style={{ background: colors.bg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, padding: "0.85rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.6rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>{ent.name || "Untitled"}</div>
                      <div style={{ color: colors.textDim, fontSize: "0.7rem" }}>{ent.num_steps ? `${ent.num_steps} steps · ` : ""}{(ent.unique_delivered || 0).toLocaleString()} delivered</div>
                    </div>
                    <div style={{ background: ent.active ? "rgba(16,185,129,0.15)" : "rgba(156,163,175,0.15)", color: ent.active ? colors.green : colors.textDim, padding: "0.2rem 0.5rem", borderRadius: 4, fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", flexShrink: 0 }}>
                      {ent.active ? "Active" : "Paused"}
                    </div>
                  </div>
                  {/* Rate bars driven by CLIENT.rateMetrics. Empty array = no bars. */}
                  {CLIENT.rateMetrics && CLIENT.rateMetrics.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "0.6rem" }}>
                      {CLIENT.rateMetrics.map(m => {
                        const raw = ent[m.key] || 0;
                        const displayValue = m.scale === 100 ? raw * 100 : raw;
                        return (
                          <div key={m.key}>
                            <div style={{ color: colors.textDim, fontSize: "0.65rem" }}>
                              {m.label} {displayValue.toFixed(m.decimals ?? 1)}{m.scale === 100 ? "%" : ""}
                            </div>
                            <Bar value={displayValue} max={m.scale} color={colors[m.color] || colors.cyan} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* === Backported: Per-metric sparkline grid driven by clientConfig.sparklineMetrics === */}
                  {(() => {
                    const sparklineMetrics = clientConfig.sparklineMetrics || [];
                    if (sparklineMetrics.length === 0) return null;
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem", marginTop: "0.3rem" }}>
                        {sparklineMetrics.map(m => (
                          <Sparkline
                            key={m.key}
                            trend={trendsByEntity[ent.id]}
                            range={trendRange}
                            metricKey={m.key}
                            metricLabel={m.label}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating Chat Button */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          style={{
            position: "fixed", bottom: "1.25rem", right: "1.25rem",
            width: 60, height: 60, borderRadius: "50%", border: "none",
            background: colors.blue, color: "#fff", fontSize: "1.5rem",
            cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center"
          }}
          aria-label="Open chat"
        >
          {chatOpen ? "×" : "💬"}
        </button>

        {chatOpen && (
          <div
            style={{
              position: "fixed", bottom: "5.5rem", right: "1.25rem",
              width: "min(380px, calc(100vw - 2.5rem))",
              height: "min(560px, calc(100vh - 8rem))",
              background: colors.panel, border: `1px solid ${colors.panelBorder}`,
              borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              zIndex: 999, display: "flex", flexDirection: "column", overflow: "hidden"
            }}
          >
            <div style={{ padding: "0.85rem 1rem", borderBottom: `1px solid ${colors.panelBorder}`, fontWeight: 600, color: colors.cyan }}>
              {CLIENT.assistantTitle}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {chatMessages.length === 0 && (
                <div style={{ color: colors.textDim, fontSize: "0.85rem" }}>
                  {CLIENT.chatExamples}
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {m.content && (
                    <div
                      style={{
                        background: m.role === "user" ? colors.blue : "#1f2937",
                        color: m.role === "user" ? "#fff" : colors.text,
                        padding: "0.55rem 0.75rem", borderRadius: 10,
                        fontSize: "0.85rem", whiteSpace: "pre-wrap", lineHeight: 1.4,
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start"
                      }}
                    >
                      {m.content}
                    </div>
                  )}
                  {m.proposal && (!m.applied || m.applied.status !== "success") && (
                    <ProposalTray
                      proposal={m.proposal}
                      proposalState={statusToProposalState(m.applied)}
                      proposalResult={m.applied}
                      proposalPreview={proposalPreviews[i] || null}
                      onApply={() => applyProposal(i)}
                      onCancel={() => cancelProposal(i)}
                    />
                  )}
                  {m.applied && m.applied.status === "success" && (
                    <div style={{ background: "rgba(16,185,129,0.10)", border: `1px solid ${colors.green}`, borderRadius: 8, padding: "0.6rem 0.75rem", fontSize: "0.78rem", color: colors.text }}>
                      <div style={{ color: colors.green, fontWeight: 600, marginBottom: "0.25rem" }}>
                        {m.applied.type === "pause_sequence"   ? "Paused" :
                         m.applied.type === "archive_sequence" ? "Archived" :
                         m.applied.type === "edit_step"        ? `Edited step (${(m.applied.updated_fields || []).join(" + ") || "updated"})` :
                                                                  `Created in ${CLIENT.dataSourceLabel}`}
                      </div>
                      <div style={{ color: colors.textDim, fontSize: "0.72rem" }}>{m.applied.entity_name}</div>
                      {(!m.applied.type || m.applied.type === "create_sequence") && (
                        <div style={{ color: colors.textDim, fontSize: "0.7rem", marginTop: "0.3rem" }}>Open {CLIENT.dataSourceLabel} to verify, fill in any placeholders, then activate.</div>
                      )}
                    </div>
                  )}
                  {m.applied && m.applied.status === "cancelled" && (
                    <div style={{ color: colors.textDim, fontSize: "0.72rem", fontStyle: "italic" }}>Proposal dismissed.</div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{ color: colors.textDim, fontSize: "0.8rem", fontStyle: "italic" }}>Thinking...</div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${colors.panelBorder}`, padding: "0.6rem", display: "flex", gap: "0.4rem" }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                placeholder={CLIENT.chatPlaceholder}
                style={{
                  flex: 1, background: "#0a0e1a",
                  border: `1px solid ${colors.panelBorder}`, borderRadius: 8,
                  color: colors.text, padding: "0.55rem 0.7rem",
                  fontSize: "0.85rem", outline: "none"
                }}
              />
              <button
                onClick={startVoiceInput}
                disabled={chatLoading || isListening}
                style={{
                  background: isListening ? colors.red : "#1f2937",
                  color: "#fff", border: "none", borderRadius: 8,
                  padding: "0 0.75rem", fontSize: "1rem",
                  cursor: chatLoading ? "not-allowed" : "pointer",
                  opacity: chatLoading ? 0.6 : 1
                }}
                aria-label="Voice input"
              >
                {isListening ? "🔴" : "🎤"}
              </button>
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  background: colors.blue, color: "#fff", border: "none",
                  borderRadius: 8, padding: "0 0.9rem", fontSize: "0.85rem",
                  cursor: chatLoading ? "not-allowed" : "pointer",
                  opacity: chatLoading ? 0.6 : 1
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
        <footer style={{ textAlign: "center", color: colors.textDim, fontSize: "0.7rem", marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: `1px solid ${colors.panelBorder}` }}>
          {lastRefresh && <>Refreshed {lastRefresh.toLocaleTimeString()} · </>}{todayShort} · Atlas AI Group
        </footer>
      </div>
    </div>
  );
}

export default App;
