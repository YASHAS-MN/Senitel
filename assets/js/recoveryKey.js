/* ============================================================
   recoveryKey.js — the owner-only recovery secret (Objective 4)
   Stored as a SHA-256 hash (see core.js:sha256), never in plaintext.
   Used ONLY when trust collapses fully (the LOCK band). This is a
   knowledge-factor fallback, not the source of trust itself -- trust
   comes from the continuity of behavioural evidence (see mlAdapter.js).
   ============================================================ */

const RecoveryKey = {
  STORAGE_KEY: "bg_recovery_hash",

  isSet(){ return !!localStorage.getItem(this.STORAGE_KEY); },

  async set(plain){
    localStorage.setItem(this.STORAGE_KEY, await sha256(plain));
  },

  async verify(plain){
    return (await sha256(plain)) === localStorage.getItem(this.STORAGE_KEY);
  },

  // Demo convenience only: seeds a known default so a presenter can
  // recover the very first time without having set a key yet.
  // Encourage changing it before presenting (surfaced in the UI).
  async seedDefaultIfMissing(){
    if(!this.isSet()) await this.set(CONFIG.DEFAULT_RECOVERY_KEY);
  }
};
