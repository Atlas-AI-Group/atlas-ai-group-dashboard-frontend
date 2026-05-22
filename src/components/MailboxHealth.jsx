// MailboxHealth.jsx
// Renders per-mailbox health badges with a top-level "X/Y working" banner.
// Hidden if the API call fails or returns no mailboxes.
//
// Backport note (2026-05-17): extracted from BlueKey App.jsx:408-468. No
// client-specific strings — the BlueKey copy referenced Apollo's UI; the
// generic version says "your source's settings".

import { colors } from "../theme";

function fmtSince(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3600000;
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + "m ago";
  if (h < 24) return Math.round(h) + "h ago";
  return Math.round(h / 24) + "d ago";
}

export function MailboxHealth({ mailboxSummary }) {
  if (!mailboxSummary || !mailboxSummary.mailboxes) return null;

  const working = mailboxSummary.working_mailboxes || 0;
  const total = mailboxSummary.total || 0;
  const allBroken = working === 0 && total > 0;
  const banner = working === 0 && total > 0
    ? { color: colors.red,    label: "CRITICAL — NO SENDING MAILBOX", icon: "✕" }
    : working < total
    ? { color: "#fbbf24",     label: `${working}/${total} MAILBOXES WORKING`, icon: "!" }
    : { color: colors.green,  label: `${total}/${total} MAILBOXES WORKING`, icon: "✓" };

  const stateMeta = {
    ok:       { color: colors.green,    label: "OK",       bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.35)" },
    revoked:  { color: colors.red,      label: "REVOKED",  bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.35)" },
    stale:    { color: "#fbbf24",       label: "STALE",    bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.35)" },
    inactive: { color: colors.textDim,  label: "INACTIVE", bg: "rgba(156,163,175,0.10)", border: "rgba(156,163,175,0.35)" }
  };

  return (
    <div style={{ background: colors.panel, border: "1px solid " + banner.color, borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
        <span style={{ background: banner.color, color: colors.bg, width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.9rem" }}>{banner.icon}</span>
        <h2 style={{ fontSize: "1rem", margin: 0, fontWeight: 600 }}>Mailbox Health · <span style={{ color: banner.color }}>{banner.label}</span></h2>
      </div>
      {allBroken && (
        <div style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 6, padding: "0.55rem 0.7rem", marginBottom: "0.85rem", color: colors.text, fontSize: "0.78rem", lineHeight: 1.45 }}>
          None of your connected mailboxes can send right now. Sequences may appear "Active" but cannot actually deliver email until at least one mailbox is reconnected. Open your source's settings &rarr; Email Accounts &rarr; reconnect (re-enter password or re-authorize OAuth).
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {(mailboxSummary.mailboxes || []).map(m => {
          const meta = stateMeta[m.health_state] || stateMeta.inactive;
          return (
            <div key={m.id} style={{ background: meta.bg, border: "1px solid " + meta.border, borderRadius: 8, padding: "0.7rem 0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap", minWidth: 0 }}>
                  <span style={{ color: meta.color, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>{meta.label}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 500, wordBreak: "break-all" }}>{m.email}</span>
                  {m.default && <span style={{ color: colors.cyan, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.05em" }}>DEFAULT</span>}
                </div>
                <span style={{ color: colors.textDim, fontSize: "0.7rem", flexShrink: 0 }}>
                  {m.provider || "?"} · synced {fmtSince(m.last_synced_at)}
                </span>
              </div>
              {m.legacy_revoked_at && m.health_state === "revoked" && (
                <div style={{ color: colors.textDim, fontSize: "0.72rem", marginTop: "0.35rem" }}>
                  Revoked {fmtSince(m.legacy_revoked_at)} — reconnect in your source's email-accounts settings.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
