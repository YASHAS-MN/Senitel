/* ============================================================
   session.js — login gate
   Auth state lives in AppState (not security-critical state in
   localStorage). A lightweight localStorage flag only remembers
   that a session was opened, so a refresh doesn't dump you out.
   ============================================================ */

const Session = {
  login(user){
    AppState.session.loggedIn = true;
    AppState.session.user = user || "Yashas";
    AppState.session.startedAt = Date.now();
    localStorage.setItem("bg_session","1");
  },

  logout(){
    addAudit("User logged out");
    AppState.session.loggedIn = false;
    AppState.session.user = null;
    localStorage.removeItem("bg_session");
    location.reload();
  },

  isLoggedIn(){
    return AppState.session.loggedIn || localStorage.getItem("bg_session")==="1";
  }
};
