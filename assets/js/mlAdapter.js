/* ============================================================
   mlAdapter.js — the ONLY bridge to the ML/auth engine.
   Phase 1: no real model. Trust is set by the demo control.
   This module owns the FAIL-CLOSED heartbeat: if behavioural
   evidence stops arriving (collector killed / model deleted),
   trust DECAYS toward locked instead of freezing.

   Later (Phase 3): signal() will POST the feature vector to
   CONFIG.API_URL and read back {trust, prediction, risk, ...}.
   Nothing outside this file changes when that happens.
   ============================================================ */

const MLAdapter = {
  mode: CONFIG.SIMULATION ? "simulation" : "live",
  heartbeatTimer: null,

  // Called whenever fresh behavioural evidence is produced.
  // In Phase 1 the demo control called this each tick. Now the real
  // Collector calls it with a real feature vector every tick.
  async signal(features){
    if(features) AppState.features = { ...AppState.features, ...features };

    if(this.mode === "live"){
      try{
        const res = await fetch(CONFIG.API_URL + "/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features: AppState.features })
        });
        if(!res.ok) throw new Error("API responded " + res.status);
        const out = await res.json();

        // Bug fix: right after a recovery-key unlock, don't let a single
        // prediction (still possibly scoring the pre-recovery window) shove
        // trust straight back into RESTRICT/LOCK. See showLockoutModal().
        let trust = out.trust;
        if(Date.now() < AppState.ml.recoveryGraceUntil){
          trust = Math.max(trust, CONFIG.RECOVERY_GRACE_FLOOR);
        }

        TrustController.setData({
          trust,
          prediction: out.prediction,
          confidence: out.confidence,
          risk: out.risk
        });

        // Evidence freshness only advances on a SUCCESSFUL round trip.
        // If Flask is unreachable, this is skipped -> the heartbeat below
        // sees stale evidence and decays trust, the same as a dead collector.
        AppState.ml.lastSignalAt = Date.now();
        AppState.ml.collector = "CONNECTED";
        AppState.ml.events += 1;
        AppState.health.collector = "CONNECTED";
        AppState.health.api = "CONNECTED";
        AppState.health.model = "LIVE";
        this.connected = true;
      } catch(e){
        AppState.health.api = "DISCONNECTED";
        this.connected = false;
        // deliberately do NOT touch lastSignalAt here -- see comment above
      }
      return;
    }

    // Simulation mode: no model exists yet; a collector tick reaching here
    // IS the evidence that keeps the fail-closed heartbeat alive.
    AppState.ml.lastSignalAt = Date.now();
    AppState.ml.collector = "CONNECTED";
    AppState.ml.events += 1;
    AppState.health.collector = "CONNECTED";
  },

  // Fail-closed loop. Runs once, globally.
  startHeartbeat(){
    if(this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(()=>{
      const silentFor = Date.now() - AppState.ml.lastSignalAt;

      if(silentFor > CONFIG.SIGNAL_TIMEOUT_MS){
        // No evidence -> we cannot vouch for the user -> decay.
        if(AppState.ml.collector !== "SIGNAL_LOST"){
          AppState.ml.collector = "SIGNAL_LOST";
          AppState.health.collector = "SIGNAL_LOST";
          addSecurityEvent("Behavioural evidence lost \u2014 trust decaying", "danger");
        }
        const next = Math.max(0, AppState.ml.trust - CONFIG.DECAY_PER_TICK);
        const floored = Date.now() < AppState.ml.recoveryGraceUntil
          ? Math.max(next, CONFIG.RECOVERY_GRACE_FLOOR)
          : next;
        TrustController.setTrust(floored);
      }

      // derive display fields from current trust
      this._deriveFromTrust();
      AppState.health.heartbeat = secondsAgo(AppState.ml.lastSignalAt);
      AppState.health.predictionCount += 1;
    }, CONFIG.HEARTBEAT_MS);
  },

  _deriveFromTrust(){
    const t = AppState.ml.trust;
    let pred="GENUINE USER", risk="LOW";
    if(t < 40){ pred="HIGH RISK"; risk="CRITICAL"; }
    else if(t < 60){ pred="SUSPICIOUS"; risk="HIGH"; }
    else if(t < 80){ pred="LIKELY GENUINE"; risk="MEDIUM"; }
    TrustController.setData({ prediction:pred, risk, confidence:+(t/100).toFixed(2),
                             latency:+(Math.random()*4+6).toFixed(1) }, true);
  }
};

function secondsAgo(ts){
  const s = Math.max(0, Math.round((Date.now()-ts)/1000));
  return s <= 1 ? "just now" : s + " sec ago";
}