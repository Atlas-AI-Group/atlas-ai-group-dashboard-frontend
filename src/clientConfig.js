// clientConfig.js — frontend mirror of the per-client knobs.
// Keep the FEATURES / kpiMetrics / sparklineMetrics blocks in sync with
// backend/clientConfig.js.
//
// CLIENT: Atlas AI Group — Atlas's own internal dashboard. Configured 2026-05-22.

const clientConfig = {
  // === Client identity (documentation; UI branding lives in App.jsx CLIENT) ===
  CLIENT_BRAND:   "Atlas AI Consulting Group",
  CLIENT_TAGLINE: "From Insight to Impact",
  CLIENT_POSITIONING: "Secure AI · Privacy-First · Your Data Stays Yours · Atlanta-based",
  OPERATOR_NAME:  "David Lewgood",
  OPERATOR_EMAIL: "davidl@bluekeycrc.com",
  CLIENT_ICP:     "Small/mid-market B2B companies running outbound sales who want their lead-gen tooling unified into one AI dashboard",

  // ===========================================================================
  // === Feature flags + metric config =========================================
  // ===========================================================================

  FEATURES: {
    stormReadiness: false,
    mailboxHealth:  false,  // OFF for Atlas — shared Apollo account would expose BlueKey's mailboxes
    healthPanel:    true,
    editStep:       true,
    proposals: {
      create:   true,
      pause:    true,
      archive:  true,
      editStep: true
    }
  },

  PROTECTED_CAMPAIGN_IDS: [],

  kpiMetrics: [
    { key: "active",    label: "Active Sequences", accent: "cyan"  },
    { key: "delivered", label: "Delivered · 24h",  accent: "text"  },
    { key: "opened",    label: "Opens · 24h",      accent: "blue"  },
    { key: "replied",   label: "Replies · 24h",    accent: "green" }
  ],

  sparklineMetrics: [
    { key: "opened",  label: "OPENS · 30D",   color: "blue"  },
    { key: "clicked", label: "CLICKS · 30D",  color: "cyan"  },
    { key: "replied", label: "REPLIES · 30D", color: "green" }
  ]
};

export default clientConfig;
