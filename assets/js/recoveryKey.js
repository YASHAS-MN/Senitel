/* ============================================================
   recoveryKey.js — the owner-only recovery secret (Objective 4)
   Stored server-side as an Argon2id hash in SQLite (see
   server/recovery_key_store.py), never in plaintext, never in
   the browser. Used ONLY when trust collapses fully (the LOCK
   band). This is a knowledge-factor fallback, not the source of
   trust itself -- trust comes from the continuity of behavioural
   evidence (see mlAdapter.js).
   ============================================================ */

const RecoveryKey = {
  // Same origin as the live model server (mlAdapter.js talks to this too).
  API_BASE: (typeof CONFIG !== "undefined" && CONFIG.API_URL) || "http://127.0.0.1:5000",

  async isSet(){
    try {
      const res = await fetch(`${this.API_BASE}/api/recovery-key/status`, { method: "GET" });
      if(!res.ok) return false;
      const data = await res.json();
      return !!data.isSet;
    } catch(e){
      console.error("RecoveryKey.isSet: request failed", e);
      return false;
    }
  },

  async set(plain, currentKey=""){
    const res = await fetch(`${this.API_BASE}/api/recovery-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: plain, currentKey })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || !data.ok){
      throw new Error(data.error || "Failed to save recovery key.");
    }
    return true;
  },

  async verify(plain){
    try {
      const res = await fetch(`${this.API_BASE}/api/recovery-key/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: plain })
      });
      if(!res.ok) return false;
      const data = await res.json();
      return !!data.ok;
    } catch(e){
      console.error("RecoveryKey.verify: request failed", e);
      return false; // fail closed -- network/server trouble must never unlock
    }
  },

  // Demo convenience only: seeds a known default server-side so a presenter
  // can recover the very first time without having set a key yet.
  // Encourage changing it before presenting (surfaced in the UI).
  async seedDefaultIfMissing(){
    if(!(await this.isSet())){
      await this.set(CONFIG.DEFAULT_RECOVERY_KEY);
    }
  }
};
