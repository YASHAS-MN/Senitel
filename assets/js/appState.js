/* ============================================================
   appState.js — single source of truth
   Every module READS from here. Only MLAdapter / TrustController
   WRITE the ml + features fields. No view computes trust itself.
   ============================================================ */

// The 37 behavioural features the live collector must eventually emit,
// in the SAME order/units as the existing dataset. Seeded to 0 for now.
const FEATURE_KEYS = [
  "total_events","duration","avg_dt","std_dt",
  "pause_1s_count","pause_5s_count","pause_10s_count",
  "missing_xy_count","missing_xy_ratio","duplicate_ratio",
  "x_min","x_max","x_mean","x_std","x_range",
  "y_min","y_max","y_mean","y_std","y_range",
  "total_move_distance","avg_move_step","move_count","move_ratio",
  "move_duration","avg_move_speed","move_speed_std",
  "count_move","count_click","count_keydown","count_keyup","count_scroll",
  "ratio_move","ratio_click","ratio_keydown","ratio_keyup","ratio_scroll"
];

const emptyFeatures = () =>
  FEATURE_KEYS.reduce((o,k)=>{o[k]=0;return o;},{});

const AppState = {
  session: { loggedIn:false, user:null, startedAt:null },

  ml: {
    trust: 100,
    prediction: "GENUINE USER",
    confidence: 1.0,
    risk: "LOW",
    collector: "CONNECTED",     // CONNECTED | SIGNAL_LOST | OFFLINE
    latency: 0,
    events: 0,
    lastSignalAt: Date.now(),   // updated whenever fresh evidence arrives
    recoveryGraceUntil: 0       // while Date.now() < this, trust can't be pushed back into LOCK
  },

  features: emptyFeatures(),

  health: {
    collector:"CONNECTED",
    model:"AWAITING INTEGRATION",
    api:"SIMULATION",
    heartbeat:"just now",
    modelVersion:"—",
    predictionCount:0
  }
};