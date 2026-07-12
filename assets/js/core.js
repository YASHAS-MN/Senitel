/* ============================================================
   core.js — small shared utilities
   Audit trail + security event feed (in-memory), toast, helpers.
   ============================================================ */

const AuditTrail = {
  entries: [],     // {time, msg}
  events: [],      // {time, msg, kind}  (security timeline)
  _subs: [],

  add(msg){
    this.entries.unshift({ time:nowTime(), msg });
    this.entries = this.entries.slice(0,100);
    this._emit();
  },
  event(msg, kind="info"){
    this.events.unshift({ time:nowTime(), msg, kind });
    this.events = this.events.slice(0,100);
    this._emit();
  },
  subscribe(cb){ this._subs.push(cb); },
  _emit(){ this._subs.forEach(cb=>cb(this)); }
};

// back-compat function names used across views
const addAudit         = (m)        => AuditTrail.add(m);
const addSecurityEvent = (m,k)      => AuditTrail.event(m,k);

function nowTime(){
  return new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

function money(n){
  return CONFIG.CURRENCY + Number(n||0).toLocaleString("en-IN");
}

function showToast(message, type="info"){
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 3000);
}

// tiny DOM helper
const $ = (id) => document.getElementById(id);

// NOTE: the recovery key and login password are no longer hashed here.
// Both secrets are now hashed server-side with Argon2id and stored in
// SQLite (see server/recovery_key_store.py and server/credentials_store.py).
// recoveryKey.js and credentials.js only ever send the plaintext secret to
// the Flask API over the request body -- they do no hashing or storage of
// their own, so there is no client-side hashing helper needed here anymore.

// The Living Signature -- a flowing ink-line waveform representing trust.
// Markup is static; CSS drives the flowing animation. JS only ever toggles
// the band-* class, so this never has to recompute anything itself.
function signatureWaveHTML(size){
  const cls = size === "lg" ? "signature-wave lg band-full" : "signature-wave band-full";
  return `<span class="${cls}" aria-hidden="true">
    <svg viewBox="0 0 120 24" class="signature-track">
      <path class="signature-path" d="M0,12 C10,2 20,2 30,12 C40,22 50,22 60,12 C70,2 80,2 90,12 C100,22 110,22 120,12"/>
    </svg>
  </span>`;
}
function setSignatureBand(el, band){
  if(!el || !band) return;
  const size = el.classList.contains("lg") ? " lg" : "";
  el.className = "signature-wave" + size + " band-" + band.toLowerCase();
}