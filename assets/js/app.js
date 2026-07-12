/* ============================================================
   app.js — bootstrap
   Wires the shell, starts the fail-closed heartbeat, mounts the
   demo control, and routes a SINGLE trust subscription to the
   currently-mounted view (so subscriptions never accumulate).
   ============================================================ */

function syncShell(){
  const app = document.querySelector(".app");
  const loggedIn = Session.isLoggedIn();
  app.classList.toggle("logged-out", !loggedIn);
  document.querySelector(".sidebar").style.display = loggedIn ? "flex" : "none";
}

function buildSidebar(){
  const items = [
    ["dashboard","Dashboard","\u{1F3E0}"],
    ["transfer","Transfer","\u{1F4B8}"],
    ["accounts","Accounts","\u{1F3E6}"],
    ["cards","Cards","\u{1F4B3}"],
    ["beneficiaries","Beneficiaries","\u{1F465}"],
    ["loans","Loans","\u{1F3E2}"],
    ["investments","Investments","\u{1F4C8}"],
    ["statements","Statements","\u{1F9FE}"],
    ["history","History","\u{1F4CB}"],
    ["profile","Profile & Security","\u2699\uFE0F"]
  ];
  return items.map(([v,label,ic])=>
    `<a data-view="${v}"><span>${ic}</span><span>${label}</span></a>`).join("");
}

document.addEventListener("DOMContentLoaded", async ()=>{
  // Build the shell
  document.querySelector(".nav").innerHTML = buildSidebar();
  document.querySelectorAll(".nav a").forEach(a=>{
    a.onclick = ()=> loadView(a.dataset.view);
  });
  document.querySelector(".logout").onclick = ()=> Session.logout();

  // Dev-only access to the Research Console -- deliberately NOT in the main
  // nav so the app reads as an ordinary banking site to anyone demoing or
  // using it normally. A small, quiet link in the sidebar footer, plus a
  // keyboard shortcut, both call the exact same loadView("research").
  const devLink = document.createElement("a");
  devLink.className = "dev-link";
  devLink.textContent = "Research Console";
  devLink.title = "Developer access \u2014 not part of the customer-facing app";
  devLink.onclick = ()=> loadView("research");
  document.querySelector(".sidebar").appendChild(devLink);

  document.addEventListener("keydown", e=>{
    if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==="r"){
      e.preventDefault();
      loadView("research");
    }
  });

  // Demo convenience: seed known defaults if the owner hasn't set their own.
  // RecoveryKey.seedDefaultIfMissing() now calls the Flask API (Argon2id +
  // SQLite), so it must be awaited -- otherwise the app can finish loading
  // before the seed request resolves. Wrapped so a not-yet-running backend
  // fails loud (console) instead of silently.
  try{
    await Credentials.seedDefaultIfMissing();
  } catch(e){
    console.error("Credentials.seedDefaultIfMissing failed:", e);
  }
  try{
    await RecoveryKey.seedDefaultIfMissing();
  } catch(e){
    console.error("RecoveryKey.seedDefaultIfMissing failed (is the Flask server running?):", e);
  }

  // One trust subscription -> current view + a band-transition watch that
  // triggers the total-lockout recovery modal (Objective 4).
  let wasLocked = false;
  TrustController.subscribe(d=>{
    if(currentView && Views[currentView] && Views[currentView].onTrust){
      Views[currentView].onTrust(d);
    }
    const locked = PolicyEngine.evaluate(d.trust).band === "LOCK";
    if(locked && !wasLocked) showLockoutModal();
    wasLocked = locked;
  });

  // Real behavioural collector + its fail-closed heartbeat
  Collector.start();
  MLAdapter.startHeartbeat();
  DemoControl.mount();

  // Initial route
  syncShell();
  loadView(Session.isLoggedIn() ? "dashboard" : "login");
});