/* ============================================================
   router.js — JS view router (no fetch, runs from file://)
   Renders Views[name].render() into #viewContainer, then init().
   Tracks per-view timers and clears them on navigation, fixing
   the old duplicate-setInterval bug on the research dashboard.
   ============================================================ */

// Per-view timer registry. Views call ViewTimers.add(id) so the
// router can clear them when navigating away.
const ViewTimers = {
  _ids: [],
  add(id){ this._ids.push(id); },
  clearAll(){ this._ids.forEach(clearInterval); this._ids = []; }
};

let currentView = null;

function loadView(name){
  // Auth gate: nothing but login before login.
  if(name !== "login" && !Session.isLoggedIn()){
    name = "login";
  }

  const view = Views[name];
  if(!view){
    $("viewContainer").innerHTML = `<div class="page"><h2>View not found</h2></div>`;
    return;
  }

  ViewTimers.clearAll();                 // stop previous view's loops
  currentView = name;

  $("viewContainer").innerHTML = view.render();
  document.querySelector("main").classList.toggle("console-mode", name === "research");
  highlightNav(name);

  if(typeof view.init === "function") view.init();

  PolicyEngine.apply();                  // re-apply policy to fresh DOM
  addAudit("Opened " + name);
}

function highlightNav(name){
  document.querySelectorAll(".nav a").forEach(a=>{
    a.classList.toggle("active", a.dataset.view === name);
  });
  const devLink = document.querySelector(".dev-link");
  if(devLink) devLink.classList.toggle("active", name === "research");
}