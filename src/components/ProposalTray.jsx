// ProposalTray.jsx
// Renders the pending chat proposal with Apply / Cancel actions. Supports four
// proposal types: create_sequence, pause_sequence, archive_sequence, edit_step.
//
// Backport note (2026-05-17): the template ships a ProposalTray that handles
// create_sequence only. This version extends it for pause/archive/edit_step,
// and adds the precision-gated AI-variable safety warning for edit_step.
//
// Props:
//   proposal              — the pending proposal object from /api/chat
//   proposalState         — "idle" | "applying" | "applied" | "error"
//   proposalResult        — server response from the Apply call (success or error body)
//   proposalPreview       — for edit_step: the previewStep() response with AI-var detection
//   onApply               — () => void
//   onCancel              — () => void

import { colors } from "../theme";

export function ProposalTray({ proposal, proposalState, proposalResult, proposalPreview, onApply, onCancel }) {
  if (!proposal) return null;

  const typeLabel = {
    create_sequence:  "Create Sequence",
    pause_sequence:   "Pause Sequence",
    archive_sequence: "Archive Sequence",
    edit_step:        `Edit Step ${proposal.step_position || "?"}`
  }[proposal.type] || proposal.type;

  // Precision-gated AI-variable safety warning: only fires when the field being
  // edited overlaps with where the AI variables actually live.
  const aiWarning = (() => {
    if (proposal.type !== "edit_step") return null;
    if (!proposalPreview || !proposalPreview.template) return null;
    const tpl = proposalPreview.template;
    const editingSubject = typeof proposal.new_subject === "string";
    const editingBody    = typeof proposal.new_body_text === "string";
    const overwritesSubjectAI = editingSubject && tpl.ai_variables_in_subject;
    const overwritesBodyAI    = editingBody    && tpl.ai_variables_in_body;
    if (!overwritesSubjectAI && !overwritesBodyAI) return null;
    const affectedAreas = [overwritesSubjectAI ? "subject" : null, overwritesBodyAI ? "body" : null].filter(Boolean).join(" and ");
    return {
      affectedAreas,
      detected: (tpl.ai_variables_detected || []).join(", ") || "AI generator"
    };
  })();

  return (
    <div style={{ background: "rgba(34,211,238,0.08)", border: "1px solid " + colors.cyan, borderRadius: 10, padding: "0.75rem", marginTop: "0.4rem" }}>
      <div style={{ color: colors.cyan, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem" }}>
        Proposed: {typeLabel}
      </div>
      <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", lineHeight: 1.3 }}>
        {proposal.name || proposal.sequence_name}
      </div>

      {aiWarning && (
        <div style={{ background: "rgba(244,114,182,0.10)", border: "1px solid rgba(244,114,182,0.45)", borderRadius: 6, padding: "0.4rem 0.55rem", marginBottom: "0.5rem" }}>
          <div style={{ color: "#f472b6", fontSize: "0.65rem", fontWeight: 700, marginBottom: "0.25rem" }}>AI PERSONALIZATION WILL BE OVERWRITTEN</div>
          <div style={{ color: colors.text, fontSize: "0.72rem", lineHeight: 1.4 }}>
            The {aiWarning.affectedAreas} of this step currently uses AI variables ({aiWarning.detected}). Applying this edit replaces the AI-generated content with the static text below — per-contact personalization for this step will stop until you restore the AI variable.
          </div>
        </div>
      )}

      {proposal.type === "edit_step" && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid " + colors.panelBorder, borderRadius: 6, padding: "0.4rem 0.55rem", marginBottom: "0.5rem" }}>
          {typeof proposal.new_subject === "string" && (
            <div style={{ marginBottom: typeof proposal.new_body_text === "string" ? "0.4rem" : 0 }}>
              <div style={{ color: colors.textDim, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "0.2rem" }}>NEW SUBJECT</div>
              <div style={{ color: colors.text, fontSize: "0.78rem", lineHeight: 1.35, wordBreak: "break-word" }}>{proposal.new_subject}</div>
            </div>
          )}
          {typeof proposal.new_body_text === "string" && (
            <div style={{ marginBottom: Number.isInteger(proposal.new_wait_days) ? "0.4rem" : 0 }}>
              <div style={{ color: colors.textDim, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "0.2rem" }}>NEW BODY</div>
              <div style={{ color: colors.text, fontSize: "0.78rem", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "10rem", overflowY: "auto" }}>{proposal.new_body_text}</div>
            </div>
          )}
          {Number.isInteger(proposal.new_wait_days) && (
            <div>
              <div style={{ color: colors.textDim, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "0.2rem" }}>NEW WAIT</div>
              <div style={{ color: colors.text, fontSize: "0.78rem", lineHeight: 1.4 }}>
                {proposal.new_wait_days} day{proposal.new_wait_days === 1 ? "" : "s"} {proposal.step_position === 1 ? "from sequence start" : "after the prior step"}
              </div>
            </div>
          )}
        </div>
      )}

      {proposal.summary && (
        <div style={{ color: colors.textDim, fontSize: "0.75rem", marginBottom: "0.5rem", lineHeight: 1.4 }}>
          {proposal.summary}
        </div>
      )}
      {Array.isArray(proposal.warnings) && proposal.warnings.length > 0 && (
        <div style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 6, padding: "0.4rem 0.55rem", marginBottom: "0.5rem" }}>
          <div style={{ color: "#fbbf24", fontSize: "0.65rem", fontWeight: 700, marginBottom: "0.25rem" }}>WARNINGS</div>
          {proposal.warnings.map((w, i) => (
            <div key={i} style={{ color: colors.text, fontSize: "0.75rem", lineHeight: 1.4 }}>• {w}</div>
          ))}
        </div>
      )}
      {Array.isArray(proposal.steps) && proposal.steps.length > 0 && (
        <div style={{ color: colors.textDim, fontSize: "0.7rem", marginBottom: "0.5rem" }}>
          {proposal.steps.length} email step(s)
        </div>
      )}
      {proposalState === "error" && proposalResult && (
        <div style={{ color: colors.red, fontSize: "0.7rem", marginBottom: "0.5rem", lineHeight: 1.4 }}>
          <div>Error: {proposalResult.error || "Failed to apply proposal"}</div>
          {proposalResult.hint && (
            <div style={{ color: colors.textDim, marginTop: "0.25rem" }}>{proposalResult.hint}</div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
        <button
          onClick={onApply}
          disabled={proposalState === "applying" || proposalState === "applied"}
          style={{
            background: proposalState === "applied" ? colors.green : colors.cyan,
            color: colors.bg,
            border: "none",
            borderRadius: 6,
            padding: "0.4rem 0.9rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: (proposalState === "applying" || proposalState === "applied") ? "wait" : "pointer",
            flex: 1
          }}
        >
          {proposalState === "applying" ? "Applying..." : proposalState === "applied" ? "✓ Applied" : "Apply"}
        </button>
        <button
          onClick={onCancel}
          disabled={proposalState === "applying"}
          style={{
            background: "transparent",
            color: colors.textDim,
            border: "1px solid " + colors.panelBorder,
            borderRadius: 6,
            padding: "0.4rem 0.9rem",
            fontSize: "0.8rem",
            cursor: proposalState === "applying" ? "not-allowed" : "pointer"
          }}
        >
          {proposalState === "applied" ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
