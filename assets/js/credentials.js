/* ============================================================
   credentials.js — real login credentials for this prototype.
   Username and password are both stored server-side (see
   server/credentials_store.py): the password as an Argon2id hash
   in SQLite, never in plaintext and never in the browser.
   Changeable from Profile & Security.
   ============================================================ */

const Credentials = {
  API_BASE: (typeof CONFIG !== "undefined" && CONFIG.API_URL) || "http://127.0.0.1:5000",

  // Cached locally only for synchronous display purposes (e.g. showing the
  // username in the header without an await on every render). This is NOT
  // a source of truth -- always re-synced from the server via status().
  _cachedUsername: null,

  async getUsername(){
    if(this._cachedUsername) return this._cachedUsername;
    try{
      const res = await fetch(`${this.API_BASE}/api/credentials/status`, { method: "GET" });
      const data = await res.json();
      this._cachedUsername = data.username || CONFIG.DEFAULT_USERNAME;
    } catch(e){
      console.error("Credentials.getUsername: request failed", e);
      this._cachedUsername = CONFIG.DEFAULT_USERNAME;
    }
    return this._cachedUsername;
  },

  // Synchronous read of the warmed cache, for use inside render() functions
  // that can't await. Falls back to the config default if nothing has been
  // fetched yet (app.js's seedDefaultIfMissing() warms this on startup).
  getUsernameSync(){
    return this._cachedUsername || CONFIG.DEFAULT_USERNAME;
  },

  async setUsername(name){
    const res = await fetch(`${this.API_BASE}/api/credentials/username`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || !data.ok){
      throw new Error(data.error || "Failed to update username.");
    }
    this._cachedUsername = name;
    return true;
  },

  async isSet(){
    try{
      const res = await fetch(`${this.API_BASE}/api/credentials/status`, { method: "GET" });
      if(!res.ok) return false;
      const data = await res.json();
      return !!data.isSet;
    } catch(e){
      console.error("Credentials.isSet: request failed", e);
      return false;
    }
  },

  async set(plain){
    const username = this._cachedUsername || await this.getUsername();
    const res = await fetch(`${this.API_BASE}/api/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: plain })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || !data.ok){
      throw new Error(data.error || "Failed to save password.");
    }
    return true;
  },

  async verify(plain, usernameAttempt){
    try{
      const username = usernameAttempt !== undefined ? usernameAttempt : (this._cachedUsername || await this.getUsername());
      const res = await fetch(`${this.API_BASE}/api/credentials/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: plain })
      });
      if(!res.ok) return false;
      const data = await res.json();
      return !!data.ok;
    } catch(e){
      console.error("Credentials.verify: request failed", e);
      return false; // fail closed -- network/server trouble must never log someone in
    }
  },

  async seedDefaultIfMissing(){
    if(!(await this.isSet())){
      this._cachedUsername = CONFIG.DEFAULT_USERNAME;
      await this.set(CONFIG.DEFAULT_PASSWORD);
    } else {
      // warm the cache so later getUsername() calls are synchronous-feeling
      await this.getUsername();
    }
  }
};