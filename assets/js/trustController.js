/* ============================================================
   trustController.js — the ONE trust pub/sub bus
   Views subscribe; they never compute trust themselves.
   ============================================================ */

const TrustController = {
  _subs: [],

  subscribe(cb){
    this._subs.push(cb);
    cb(this.getData());      // push current state immediately
  },

  notify(){
    const data = this.getData();
    this._subs.forEach(cb=>{ try{ cb(data); }catch(e){ console.error(e); } });
  },

  setData(patch, silent=false){
    Object.keys(patch).forEach(k=>{
      if(k in AppState.ml) AppState.ml[k] = patch[k];
    });
    if(!silent) this.notify();
  },

  setTrust(value){
    AppState.ml.trust = Math.max(0, Math.min(100, Math.round(value)));
    this.notify();
  },

  getData(){
    return {
      trust: AppState.ml.trust,
      prediction: AppState.ml.prediction,
      confidence: AppState.ml.confidence,
      risk: AppState.ml.risk,
      collector: AppState.ml.collector,
      latency: AppState.ml.latency,
      events: AppState.ml.events
    };
  }
};
