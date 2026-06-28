/* ============================================================
   config.js — global configuration
   SIMULATION=true  -> trust is driven by the demo control + mock.
   SIMULATION=false -> MLAdapter POSTs features to API_URL (Flask).
   Flipping this flag is the ONLY change needed to switch modes.
   ============================================================ */

const CONFIG = {
  SIMULATION: false,
  API_URL: "http://127.0.0.1:5000",   // Flask endpoint (Phase 3)

  // Fail-closed behaviour: how trust decays when the behavioural
  // evidence stream goes silent (collector killed / model deleted).
  HEARTBEAT_MS: 1000,        // how often the decay-check loop runs
  SIGNAL_TIMEOUT_MS: 4000,   // no evidence for this long => "signal lost"
  DECAY_PER_TICK: 5,         // trust points lost per heartbeat while silent

  // Real behavioural collector (Objective 2)
  COLLECTOR_WINDOW_MS: 60000,  // rolling window of raw events kept in memory
  COLLECTOR_TICK_MS: 2000,     // how often the feature vector is recomputed

  // Recovery key fallback (Objective 4) \u2014 demo default, change before presenting
  DEFAULT_RECOVERY_KEY: "owner-secret-2026",

  // Login credentials (Objective 1) \u2014 demo defaults, change in Profile & Security
  DEFAULT_USERNAME: "yashas",
  DEFAULT_PASSWORD: "demo",

  // Post-recovery grace (bug fix): after a successful recovery-key unlock,
  // trust can't be pushed back into RESTRICT/LOCK for this long, even if a
  // live prediction or the decay loop says otherwise. Without this, the
  // model's next read (still scoring the same window that caused the
  // lockout) or the heartbeat decay can re-lock within seconds, making
  // recovery feel like it "didn't work."
  RECOVERY_GRACE_MS: 15000,
  RECOVERY_GRACE_FLOOR: 60,

  CURRENCY: "\u20B9",        // INR rupee sign
};