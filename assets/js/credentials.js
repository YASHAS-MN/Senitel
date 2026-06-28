/* ============================================================
   credentials.js — real login credentials for this prototype.
   Username is stored plainly (it's not a secret); the password is
   hashed with SHA-256 (see core.js:sha256), never stored in plain
   text. Changeable from Profile & Security.
   ============================================================ */

const Credentials = {
  USER_KEY: "bg_username",
  HASH_KEY: "bg_password_hash",

  getUsername(){ return localStorage.getItem(this.USER_KEY) || CONFIG.DEFAULT_USERNAME; },

  setUsername(name){ localStorage.setItem(this.USER_KEY, name); },

  isSet(){ return !!localStorage.getItem(this.HASH_KEY); },

  async set(plain){
    localStorage.setItem(this.HASH_KEY, await sha256(plain));
  },

  async verify(plain){
    return (await sha256(plain)) === localStorage.getItem(this.HASH_KEY);
  },

  async seedDefaultIfMissing(){
    if(!localStorage.getItem(this.USER_KEY)) this.setUsername(CONFIG.DEFAULT_USERNAME);
    if(!this.isSet()) await this.set(CONFIG.DEFAULT_PASSWORD);
  }
};