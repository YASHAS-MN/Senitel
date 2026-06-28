/* ============================================================
   collector.js — the ONLY module touching raw DOM event APIs.
   Buffers mouse/keyboard/scroll events in a rolling time window,
   recomputes the 37-feature vector on a timer, and feeds
   MLAdapter.signal(features) to keep the evidence stream alive.

   Pausing the collector (or killing it) means evidence stops
   arriving -> MLAdapter's heartbeat sees silence -> trust decays.
   This is the real version of the fail-closed property the demo
   control used to fake.
   ============================================================ */

const Collector = {
  buffer: [],
  running: false,
  paused: false,
  tickTimer: null,
  sessionId: null,

  start(){
    if(this.running) return;
    this.running = true;
    this.sessionId = "live_" + Date.now();
    this._bindListeners();
    this.tickTimer = setInterval(()=>this._tick(), CONFIG.COLLECTOR_TICK_MS);
  },

  pause(){ this.paused = true; },
  resume(){ this.paused = false; },

  // Called on a successful recovery-key unlock: the rolling window still
  // contains the behaviour that caused the lockout, so without clearing it
  // the very next prediction would just score the same evidence again.
  resetBuffer(){ this.buffer = []; },

  _bindListeners(){
    let lastMoveAt = 0;
    document.addEventListener("mousemove", e=>{
      const now = performance.now();
      if(now - lastMoveAt < 16) return;   // ~60fps cap, recorded events still real movement samples
      lastMoveAt = now;
      this._push("move", e);
    });
    // mousedown captures left AND right click (the 'click' DOM event misses right-click)
    document.addEventListener("mousedown", e=> this._push("click", e));
    document.addEventListener("wheel", ()=> this._push("scroll"), {passive:true});
    document.addEventListener("keydown", ()=> this._push("keydown"));
    document.addEventListener("keyup", ()=> this._push("keyup"));
  },

  _push(type, e){
    if(this.paused) return;
    const rec = { type, t: performance.now() };
    if(e && typeof e.clientX === "number"){ rec.x = e.clientX; rec.y = e.clientY; }
    this.buffer.push(rec);
    const cutoff = performance.now() - CONFIG.COLLECTOR_WINDOW_MS;
    while(this.buffer.length && this.buffer[0].t < cutoff) this.buffer.shift();
  },

  _tick(){
    if(this.paused) return;     // signal cut -> no signal() call -> evidence goes stale on purpose
    const features = extractFeatures(this.buffer);
    MLAdapter.signal(features);
  },

  // Lets you verify, by eye, that the live vector matches a row of the
  // recorded dataset's schema and units once you resume the ML milestone.
  exportSession(){
    const features = extractFeatures(this.buffer);
    const payload = {
      session_id: this.sessionId,
      captured_at: new Date().toISOString(),
      window_ms: CONFIG.COLLECTOR_WINDOW_MS,
      ...features
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (this.sessionId || "session") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    addAudit("Exported live session feature vector");
  }
};