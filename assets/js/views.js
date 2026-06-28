/* ============================================================
   views.js — all view modules as { render, init, onTrust? }
   render() returns an HTML string; init() wires events; the
   optional onTrust(data) updates live numbers while mounted.
   A single global TrustController subscription (in app.js) calls
   the CURRENT view's onTrust, so subscriptions never accumulate.
   ============================================================ */

const Views = {};

/* ---------------- Login ---------------- */
Views.login = {
  render(){
    return `
    <div class="login-wrap">
      <div class="logo">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="1"/>
          <text x="20" y="25" text-anchor="middle" font-family="Fraunces, serif" font-size="13" font-weight="600" fill="currentColor">BG</text>
        </svg>
      </div>
      <h1>BankGuard</h1>
      <p class="subtitle">Behavioural Authentication Banking</p>
      <div class="field">
        <label for="username">Username</label>
        <input id="username" placeholder="Enter username">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" placeholder="Enter password">
      </div>
      <button id="loginBtn" class="btn block">Sign in</button>
      <p class="login-note">Demo credentials: <code>${CONFIG.DEFAULT_USERNAME}</code> /
      <code>${CONFIG.DEFAULT_PASSWORD}</code> \u2014 change them anytime from Profile &amp; Security.
      Continuous authentication begins after you sign in.</p>
    </div>`;
  },
  init(){
    const tryLogin = async ()=>{
      const u = $("username").value.trim();
      const p = $("password").value.trim();
      if(!u || !p){ showToast("Enter username and password","warning"); return; }

      const okUser = u.toLowerCase() === Credentials.getUsername().toLowerCase();
      const okPass = await Credentials.verify(p);
      if(!okUser || !okPass){
        showToast("Incorrect username or password","error");
        addSecurityEvent("Failed login attempt","warning");
        return;
      }

      Session.login(u);
      addAudit("User logged in");
      addSecurityEvent("Session started \u2014 collector engaged","success");
      AppState.ml.lastSignalAt = Date.now();
      syncShell();
      loadView("dashboard");
    };
    $("loginBtn").onclick = tryLogin;
    $("password").addEventListener("keydown", e=>{ if(e.key==="Enter") tryLogin(); });
  }
};

/* ---------------- Dashboard ---------------- */
Views.dashboard = {
  render(){
    const total = BankDB.accounts.reduce((s,a)=>s+a.balance,0);
    const rows = BankDB.transactions.slice(0,5).map(t=>`
      <tr><td>${t.date}</td><td>${t.name}</td>
      <td>${t.type==="Credit"?"+":"-"}${money(t.amount)}</td></tr>`).join("");
    return `
    <div class="page">
      <div id="trustBanner" class="trust-banner banner-ok"><span class="dot"></span>Continuous authentication active</div>
      <div class="page-head"><h1>Dashboard</h1><p>Welcome back, ${BankDB.profile.fullName}</p></div>

      <div class="grid cols-3" style="margin-bottom:24px">
        <div class="panel summary"><h3>Total Balance</h3><div class="big">${money(total)}</div><div class="sub">Across ${BankDB.accounts.length} accounts</div></div>
        <div class="panel summary"><h3>Behaviour Trust</h3><div class="big" id="dashTrust">${AppState.ml.trust}%</div><div class="sub" id="dashPred">${AppState.ml.prediction}</div><div id="dashWaveHost" style="margin-top:10px">${signatureWaveHTML()}</div></div>
        <div class="panel summary"><h3>Current Policy</h3><div class="big" id="policyStatus">Full Access</div><div class="sub">Adaptive enforcement</div></div>
      </div>

      <div class="grid cols-2">
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Recent Transactions</h3>
          <table><thead><tr><th>Date</th><th>Name</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Security Status</h3>
          <div class="info-row"><span class="k">Collector</span><span class="v" id="dashCollector">Connected</span></div>
          <div class="info-row"><span class="k">Prediction</span><span class="v" id="dashPred2">${AppState.ml.prediction}</span></div>
          <div class="info-row"><span class="k">Risk Level</span><span class="v" id="dashRisk">${AppState.ml.risk}</span></div>
          <div class="info-row"><span class="k">Events Observed</span><span class="v" id="dashEvents">${AppState.ml.events}</span></div>
        </div>
      </div>
    </div>`;
  },
  onTrust(d){
    $("dashTrust") && ($("dashTrust").textContent = d.trust + "%");
    $("dashPred")  && ($("dashPred").textContent  = d.prediction);
    $("dashPred2") && ($("dashPred2").textContent = d.prediction);
    $("dashRisk")  && ($("dashRisk").textContent  = d.risk);
    $("dashEvents")&& ($("dashEvents").textContent= AppState.ml.events);
    $("dashCollector") && ($("dashCollector").textContent =
      AppState.ml.collector==="CONNECTED" ? "Connected" : "Signal lost");
    const host = $("dashWaveHost");
    if(host) setSignatureBand(host.querySelector(".signature-wave"), PolicyEngine.evaluate(d.trust).band);
  }
};

/* ---------------- Transfer ---------------- */
Views.transfer = {
  render(){
    const accs = BankDB.accounts.map(a=>`<option value="${a.id}">${a.type} (${money(a.balance)})</option>`).join("");
    const bens = BankDB.beneficiaries.map(b=>`<option>${b.name}</option>`).join("");
    return `
    <div class="page">
      <div id="trustBanner" class="trust-banner banner-ok"><span class="dot"></span>Continuous authentication active</div>
      <div class="page-head"><h1>Fund Transfer</h1><p>Transfer money securely</p></div>
      <div class="panel" style="max-width:640px">
        <div class="field"><label>From account</label><select id="fromAccount">${accs}</select></div>
        <div class="field"><label>Beneficiary</label><select id="beneficiary">${bens}</select></div>
        <div class="field"><label>Amount</label><input id="amount" type="number" placeholder="Enter amount"></div>
        <div class="field"><label>Remarks</label><input id="remarks" placeholder="Optional"></div>
        <button id="transferButton" class="btn block">Transfer Now</button>
      </div>
    </div>`;
  },
  init(){ $("transferButton").onclick = performTransfer; }
};

function performTransfer(){
  const amount = parseFloat($("amount").value || 0);
  const trust = AppState.ml.trust;
  const policy = PolicyEngine.evaluate(trust);
  addSecurityEvent("Transfer initiated", "info");
  addAudit("Transfer initiated");

  if(policy.band === "LOCK"){ showToast("Session locked","error"); addSecurityEvent("Transfer blocked \u2014 session locked","danger"); return; }
  if(policy.band === "RESTRICT"){ showToast("Transfer restricted","warning"); addSecurityEvent("Transfer blocked by policy","danger"); return; }

  const finish = ()=>{ showToast("Transfer successful","success"); addSecurityEvent("Transfer completed","success"); addAudit("Transfer completed"); };

  if(policy.band === "STEPUP" && amount > policy.stepUpAbove){
    showVerificationModal(finish);
    return;
  }
  finish();
}

/* ---------------- Accounts ---------------- */
Views.accounts = {
  render(){
    const cards = BankDB.accounts.map(a=>`
      <div class="account-card">
        <div class="type">${a.type}</div>
        <div class="num">${a.number}</div>
        <div class="bal">${money(a.balance)}</div>
        <span class="tag tag-ok">${a.status}</span>
      </div>`).join("");
    return `<div class="page"><div class="page-head"><h1>My Accounts</h1><p>View all linked accounts</p></div>
      <div class="cards-grid">${cards}</div></div>`;
  }
};

/* ---------------- Beneficiaries ---------------- */
Views.beneficiaries = {
  render(){
    const cards = BankDB.beneficiaries.map(b=>`
      <div class="account-card">
        <div class="type">${b.name}</div>
        <div class="num">${b.bank} \u00b7 ${b.account}</div>
        <span class="tag ${b.verified?"tag-ok":"tag-pending"}">${b.verified?"Verified":"Pending"}</span>
      </div>`).join("");
    return `<div class="page">
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
        <div><h1>Beneficiaries</h1><p>Manage trusted recipients</p></div>
        <button id="addBeneficiaryButton" class="btn">+ Add Beneficiary</button>
      </div>
      <div class="cards-grid">${cards}</div></div>`;
  },
  init(){
    const b = $("addBeneficiaryButton");
    if(b) b.onclick = ()=> b.disabled ? null : showToast("Add beneficiary (prototype)","info");
  }
};

/* ---------------- Cards ---------------- */
Views.cards = {
  render(){
    const items = BankDB.cards.map(c=>`
      <div class="account-card">
        <div class="type">${c.type} \u00b7 ${c.network}</div>
        <div class="num">\u2022\u2022\u2022\u2022 ${c.last4} \u00b7 exp ${c.expiry}</div>
        ${c.limit ? `<div class="bal" style="font-size:20px">${money(c.used)} <span style="color:var(--muted);font-size:13px;font-weight:400">of ${money(c.limit)} used</span></div>` : ""}
        <div style="margin-top:14px;display:flex;align-items:center;gap:12px">
          <span class="tag ${c.status==="Active"?"tag-ok":"tag-pending"}">${c.status}</span>
          <button class="btn ghost card-toggle" data-id="${c.id}" style="padding:8px 14px;font-size:13px">${c.status==="Active"?"Freeze card":"Unfreeze"}</button>
        </div>
      </div>`).join("");
    return `<div class="page"><div class="page-head"><h1>Cards</h1><p>Manage your debit and credit cards</p></div>
      <div class="cards-grid">${items}</div></div>`;
  },
  init(){
    document.querySelectorAll(".card-toggle").forEach(btn=>{
      btn.onclick = ()=>{
        const card = BankDB.cards.find(c=>c.id===btn.dataset.id);
        card.status = card.status==="Active" ? "Frozen" : "Active";
        showToast(card.type + (card.status==="Active" ? " unfrozen" : " frozen"), card.status==="Active"?"success":"warning");
        addAudit(card.type + " " + card.status.toLowerCase());
        $("viewContainer").innerHTML = Views.cards.render();
        Views.cards.init();
      };
    });
  }
};

/* ---------------- Loans ---------------- */
Views.loans = {
  render(){
    const rows = BankDB.loans.map(l=>`
      <tr><td>${l.type}</td><td>${money(l.principal)}</td><td>${money(l.outstanding)}</td>
      <td>${l.emi ? money(l.emi) : "\u2014"}</td><td>${l.nextDue}</td>
      <td><span class="tag ${l.status==="Active"?"tag-ok":"tag-pending"}">${l.status}</span></td></tr>`).join("");
    return `<div class="page">
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:center">
        <div><h1>Loans</h1><p>Your active and closed loans</p></div>
        <button id="applyLoanButton" class="btn">Apply for Loan</button>
      </div>
      <div class="panel"><table><thead><tr><th>Type</th><th>Principal</th><th>Outstanding</th><th>EMI</th><th>Next Due</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  },
  init(){
    const btn = $("applyLoanButton");
    if(!btn) return;
    btn.onclick = ()=> btn.disabled ? null : showToast("Loan application started (prototype)","info");
    this.onTrust();
  },
  // Gated at the same trust tier as adding a beneficiary, so this page
  // also visibly demonstrates the policy engine, not just static data.
  onTrust(){
    const btn = $("applyLoanButton"); if(!btn) return;
    btn.disabled = !PolicyEngine.current().addBeneficiary;
  }
};

/* ---------------- Investments ---------------- */
Views.investments = {
  render(){
    const rows = BankDB.investments.map(i=>{
      const gain = i.current - i.invested;
      const pct = ((gain/i.invested)*100).toFixed(1);
      return `<tr><td>${i.name}</td><td>${i.type}</td><td>${money(i.invested)}</td><td>${money(i.current)}</td>
        <td><span class="tag ${gain>=0?"tag-ok":"tag-pending"}">${gain>=0?"+":""}${pct}%</span></td></tr>`;
    }).join("");
    const totalInvested = BankDB.investments.reduce((s,i)=>s+i.invested,0);
    const totalCurrent  = BankDB.investments.reduce((s,i)=>s+i.current,0);
    const overall = (((totalCurrent-totalInvested)/totalInvested)*100).toFixed(1);
    return `<div class="page"><div class="page-head"><h1>Investments</h1><p>Portfolio overview</p></div>
      <div class="grid cols-3" style="margin-bottom:20px">
        <div class="panel summary"><h3>Invested</h3><div class="big">${money(totalInvested)}</div></div>
        <div class="panel summary"><h3>Current Value</h3><div class="big">${money(totalCurrent)}</div></div>
        <div class="panel summary"><h3>Overall Return</h3><div class="big">${overall}%</div></div>
      </div>
      <div class="panel"><table><thead><tr><th>Name</th><th>Type</th><th>Invested</th><th>Current</th><th>Return</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }
};

/* ---------------- Statements ---------------- */
Views.statements = {
  render(){
    const rows = BankDB.statements.map((s,idx)=>`
      <tr><td>${s.period}</td><td>${s.account}</td><td>${s.generated}</td>
      <td><button class="btn ghost stmt-dl" data-idx="${idx}" style="padding:8px 14px;font-size:13px">Download</button></td></tr>`).join("");
    return `<div class="page"><div class="page-head"><h1>Statements</h1><p>Monthly account statements</p></div>
      <div class="panel"><table><thead><tr><th>Period</th><th>Account</th><th>Generated</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  },
  init(){
    document.querySelectorAll(".stmt-dl").forEach(btn=>{
      btn.onclick = ()=>{
        const s = BankDB.statements[+btn.dataset.idx];
        showToast(`Statement for ${s.period} downloaded (prototype)`,"success");
        addAudit("Downloaded statement " + s.period);
      };
    });
  }
};

/* ---------------- History ---------------- */
Views.history = {
  render(){
    return `<div class="page"><div class="page-head"><h1>Transaction History</h1><p>Search and review activity</p></div>
      <div class="panel">
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <input id="histSearch" class="field" style="flex:1;padding:12px;border:1px solid var(--hairline);border-radius:8px" placeholder="Search transactions...">
          <select id="histFilter" style="padding:12px;border:1px solid var(--hairline);border-radius:8px">
            <option value="ALL">All</option><option value="Debit">Debit</option><option value="Credit">Credit</option>
          </select>
        </div>
        <table><thead><tr><th>Date</th><th>Time</th><th>Name</th><th>Category</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody id="histBody"></tbody></table>
      </div></div>`;
  },
  init(){
    const draw = ()=>{
      const q = ($("histSearch").value||"").toLowerCase();
      const f = $("histFilter").value;
      $("histBody").innerHTML = BankDB.transactions
        .filter(t=> t.name.toLowerCase().includes(q) && (f==="ALL"||t.type===f))
        .map(t=>`<tr><td>${t.date}</td><td>${t.time}</td><td>${t.name}</td><td>${t.category}</td>
          <td>${t.type}</td><td>${money(t.amount)}</td><td><span class="tag tag-ok">${t.status}</span></td></tr>`).join("");
    };
    $("histSearch").oninput = draw;
    $("histFilter").onchange = draw;
    draw();
  }
};

/* ---------------- Profile ---------------- */
Views.profile = {
  render(){
    const p=BankDB.profile, s=BankDB.security;
    const row=(k,v)=>`<div class="info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    return `<div class="page"><div class="page-head"><h1>Profile &amp; Security</h1><p>Manage your account and security settings</p></div>
      <div class="grid auto">
        <div class="panel"><h3 class="section-title" style="margin-top:0">Personal</h3>
          ${row("Full Name",p.fullName)}${row("Customer ID",p.customerId)}${row("Email",p.email)}${row("Phone",p.phone)}${row("Address",p.address)}</div>
        <div class="panel"><h3 class="section-title" style="margin-top:0">Security Center</h3>
          ${row("Two-Factor Auth", s.twoFA?"Enabled":"Disabled")}${row("Last Login",s.lastLogin)}${row("Trusted Device",s.trustedDevice)}${row("Password Changed",s.lastPasswordChange)}</div>
        <div class="panel"><h3 class="section-title" style="margin-top:0">Behavioural Auth</h3>
          ${row("Behavioural Auth", s.behavioralAuth?"Enabled":"Disabled")}
          <div class="info-row"><span class="k">Current Trust</span><span class="v" id="profTrust">${AppState.ml.trust}%</span></div>
          <div class="info-row"><span class="k">Policy</span><span class="v" id="policyStatus">${PolicyEngine.current().label}</span></div></div>
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Login Credentials</h3>
          <div class="info-row"><span class="k">Current username</span><span class="v" id="credCurrentUser">${Credentials.getUsername()}</span></div>
          <div class="field" style="margin-top:14px"><label>New username</label>
            <input id="credNewUser" placeholder="Leave blank to keep current"></div>
          <div class="field"><label>New password</label>
            <input id="credNewPass" type="password" placeholder="Leave blank to keep current"></div>
          <div class="field"><label>Confirm new password</label>
            <input id="credConfirmPass" type="password" placeholder="Re-enter new password"></div>
          <button id="credSaveBtn" class="btn">Save changes</button>
        </div>
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Recovery Key</h3>
          <p style="color:var(--muted);font-size:13px;margin-bottom:14px;line-height:1.5">
            Used only when behavioural trust collapses completely (Session
            Locked). Known only to you \u2014 never shared, never stored in
            plain text.
          </p>
          <div class="field"><label>New recovery key</label>
            <input id="recoveryNewKey" type="password" placeholder="Enter a new recovery key"></div>
          <button id="recoverySetBtn" class="btn">Save recovery key</button>
          <p class="login-note" style="margin-top:16px;text-align:left">
            Demo default (change before presenting): <code>${CONFIG.DEFAULT_RECOVERY_KEY}</code>
          </p>
        </div>
      </div></div>`;
  },
  init(){
    const recBtn = $("recoverySetBtn");
    if(recBtn) recBtn.onclick = async ()=>{
      const v = $("recoveryNewKey").value.trim();
      if(!v){ showToast("Enter a key first","warning"); return; }
      await RecoveryKey.set(v);
      $("recoveryNewKey").value = "";
      showToast("Recovery key updated","success");
      addAudit("Recovery key updated");
    };

    const credBtn = $("credSaveBtn");
    if(credBtn) credBtn.onclick = async ()=>{
      const newUser = $("credNewUser").value.trim();
      const newPass = $("credNewPass").value.trim();
      const confirmPass = $("credConfirmPass").value.trim();

      if(!newUser && !newPass){ showToast("Enter a new username or password first","warning"); return; }
      if(newPass && newPass !== confirmPass){ showToast("Passwords don't match","error"); return; }
      if(newPass && newPass.length < 4){ showToast("Password must be at least 4 characters","warning"); return; }

      if(newUser) Credentials.setUsername(newUser);
      if(newPass) await Credentials.set(newPass);

      $("credNewUser").value = ""; $("credNewPass").value = ""; $("credConfirmPass").value = "";
      $("credCurrentUser").textContent = Credentials.getUsername();
      showToast("Login credentials updated","success");
      addAudit("Login credentials changed");
      addSecurityEvent("Login credentials changed","warning");
    };
  },
  onTrust(d){ $("profTrust") && ($("profTrust").textContent = d.trust+"%"); }
};

/* ---------------- Research (centerpiece) ---------------- */
Views.research = {
  render(){
    return `<div class="page">
      <div class="page-head"><h1>Behavioural Authentication \u2014 Research Console</h1>
      <p>Live continuous authentication monitoring</p></div>

      <div class="panel signature-hero">
        <span class="signature-hero-label">Live Behavioural Signature</span>
        <div id="heroWaveHost">${signatureWaveHTML("lg")}</div>
      </div>

      <div class="research-grid">
        <div class="metric"><h4>Behavioural Trust</h4><div class="val" id="socTrust">${AppState.ml.trust}%</div>
          <div class="gauge"><div class="gauge-fill" id="gaugeFill"></div></div></div>
        <div class="metric"><h4>Prediction</h4><div class="val small" id="socPred">${AppState.ml.prediction}</div></div>
        <div class="metric"><h4>Risk Level</h4><div class="val small" id="socRisk">${AppState.ml.risk}</div></div>
        <div class="metric"><h4>Collector</h4><div class="val small" id="socCollector">CONNECTED</div></div>
        <div class="metric"><h4>Latency</h4><div class="val small"><span id="socLatency">0</span> ms</div></div>
        <div class="metric"><h4>Current Policy</h4><div class="val small" id="socPolicy">Full Access</div></div>
      </div>

      <div class="grid cols-2">
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Policy Engine</h3>
          <div class="policy-flow">
            <div class="policy-stage"><h4>Current Trust</h4><div id="pfTrust">${AppState.ml.trust}%</div></div>
            <div class="policy-arrow">\u2193</div>
            <div class="policy-stage"><h4>Matched Rule</h4><div id="pfRule">Trust \u2265 80</div></div>
            <div class="policy-arrow">\u2193</div>
            <div class="policy-stage"><h4>Policy Action</h4><div id="pfAction" style="font-weight:600;color:var(--signature)">Full Access</div></div>
          </div>
        </div>
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Security Event Timeline</h3>
          <div class="timeline" id="socTimeline"></div>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:20px">
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <h3 class="section-title" style="margin:0">Behavioural Feature Vector</h3>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="tag tag-ok" id="featStatus" style="display:none">Live</span>
              <button id="exportSessionBtn" class="btn ghost" style="padding:8px 14px;font-size:13px">Export Session</button>
            </div>
          </div>
          <div id="socFeatures"></div>
        </div>
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Live Behaviour Stream</h3>
          <div class="stream" id="socStream"></div>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:20px">
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Collector &amp; Model Health</h3>
          <div class="info-row"><span class="k">Collector</span><span class="v" id="hCollector">CONNECTED</span></div>
          <div class="info-row"><span class="k">Session ID</span><span class="v" id="hSession">\u2014</span></div>
          <div class="info-row"><span class="k">Mouse Listener</span><span class="v" id="hMouse">Active</span></div>
          <div class="info-row"><span class="k">Keyboard Listener</span><span class="v" id="hKeyboard">Active</span></div>
          <div class="info-row"><span class="k">Heartbeat</span><span class="v" id="hHeartbeat">just now</span></div>
          <div class="info-row"><span class="k">Predictions</span><span class="v" id="hCount">0</span></div>
        </div>
        <div class="panel">
          <h3 class="section-title" style="margin-top:0">Model Status</h3>
          <div class="info-row"><span class="k">ML Model</span><span class="v pending">Awaiting integration</span></div>
          <div class="info-row"><span class="k">API</span><span class="v pending">Simulation</span></div>
          <h3 class="section-title">Model Statistics</h3>
          <p class="pending">Accuracy / precision / recall / confusion matrix populate from the
          trained model's offline evaluation (pending ML integration).</p>
        </div>
      </div>
    </div>`;
  },
  init(){
    this._renderFeatures();
    this._renderTimeline();
    this._renderStream();
    ViewTimers.add(setInterval(()=>{
      this._renderTimeline();
      this._renderFeatures();
      this._renderStream();
      $("hHeartbeat") && ($("hHeartbeat").textContent = AppState.health.heartbeat);
      $("hCount") && ($("hCount").textContent = AppState.health.predictionCount.toLocaleString());
      $("socLatency") && ($("socLatency").textContent = AppState.ml.latency);
      $("hSession") && ($("hSession").textContent = Collector.sessionId || "\u2014");
      $("hMouse") && ($("hMouse").textContent = Collector.paused ? "Paused" : "Active");
      $("hKeyboard") && ($("hKeyboard").textContent = Collector.paused ? "Paused" : "Active");
    }, 1000));
    $("exportSessionBtn") && ($("exportSessionBtn").onclick = ()=> Collector.exportSession());
    this.onTrust(TrustController.getData());
  },
  onTrust(d){
    const set=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
    set("socTrust", d.trust+"%"); set("pfTrust", d.trust+"%");
    set("socPred", d.prediction); set("socRisk", d.risk);
    set("socLatency", d.latency);
    set("socCollector", d.collector==="CONNECTED"?"CONNECTED":"SIGNAL LOST");
    set("hCollector", d.collector);

    const p = PolicyEngine.evaluate(d.trust);
    set("socPolicy", p.label); set("pfAction", p.label);
    const rule = d.trust>=80?"Trust \u2265 80":d.trust>=60?"60 \u2264 Trust < 80":d.trust>=40?"40 \u2264 Trust < 60":"Trust < 40";
    set("pfRule", rule);

    const g = $("gaugeFill");
    if(g){ g.style.width=d.trust+"%";
      g.style.background = d.trust>=80?"var(--signature)":d.trust>=60?"var(--brass)":d.trust>=40?"var(--rust)":"var(--seal)"; }

    const heroHost = $("heroWaveHost");
    if(heroHost) setSignatureBand(heroHost.querySelector(".signature-wave"), p.band);
  },
  _renderFeatures(){
    const host=$("socFeatures"); if(!host) return;
    // Rough visual scale only (not used for any decision) -- shows real
    // values streaming from the live Collector once it has data.
    const maxes = { avg_move_speed:600, total_move_distance:20000, avg_dt:1.0, count_keydown:150, count_scroll:80, x_std:600 };
    const keys = Object.keys(maxes);
    const anyData = FEATURE_KEYS.some(k=>AppState.features[k] > 0);
    $("featStatus") && ($("featStatus").style.display = anyData ? "inline-block" : "none");
    host.innerHTML = keys.map(k=>{
      const v = AppState.features[k] || 0;
      const pct = Math.max(0, Math.min(100, (v / maxes[k]) * 100));
      return `<div class="feature"><div class="ft"><span>${k}</span><span>${v.toFixed(2)}</span></div>
        <div class="bar"><i style="width:${anyData?pct:0}%"></i></div></div>`;
    }).join("");
  },
  _renderStream(){
    const host=$("socStream"); if(!host) return;
    const labels = {move:"Mouse Move",click:"Mouse Click",scroll:"Scroll",keydown:"Key Press",keyup:"Key Release"};
    const recent = (typeof Collector!=="undefined" ? Collector.buffer : []).slice(-10).reverse();
    host.innerHTML = recent.map(ev=>{
      const ago = Math.max(0, Math.round((performance.now()-ev.t)/1000));
      const xy = (ev.x!==undefined) ? ` (${Math.round(ev.x)}, ${Math.round(ev.y)})` : "";
      return `<div class="row"><span class="t">${ago}s ago</span><span>${labels[ev.type]||ev.type}${xy}</span></div>`;
    }).join("") || `<div class="row">Waiting for mouse/keyboard activity\u2026</div>`;
  },
  _renderTimeline(){
    const host=$("socTimeline"); if(!host) return;
    host.innerHTML = AuditTrail.events.slice(0,8).map(e=>`
      <div class="event ${e.kind}"><div class="when">${e.time}</div>${e.msg}</div>`).join("")
      || `<p class="pending">No security events yet.</p>`;
  }
};

/* ---------------- Step-up verification modal (per-transfer) ---------------- */
function showVerificationModal(callback){
  let modal = $("verificationModal");
  if(!modal){
    modal = document.createElement("div");
    modal.id = "verificationModal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-card">
        <h2>Additional verification required</h2>
        <p>Your behavioural confidence has decreased. Complete one additional
        verification to authorise this transfer.</p>
        <div class="row">
          <button id="verifyNow" class="btn">Verify identity</button>
          <button id="cancelVerify" class="btn ghost">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove("hidden");
  $("verifyNow").onclick = ()=>{ modal.classList.add("hidden"); showToast("Verification successful","success");
    addSecurityEvent("Identity verification successful","success"); addAudit("Identity verified"); callback(); };
  $("cancelVerify").onclick = ()=>{ modal.classList.add("hidden"); showToast("Transfer cancelled","warning"); };
}

/* ---------------- Total-lockout recovery modal (Objective 4) ----------------
   Distinct, harder tier from the step-up modal above: triggered when the
   policy band reaches LOCK (trust < 40), not dismissable except via a
   correct recovery key or signing out. See app.js for the band-transition
   trigger and recoveryKey.js for the hashing. ---------------------------- */
function showLockoutModal(){
  let modal = $("lockoutModal");
  if(!modal){
    modal = document.createElement("div");
    modal.id = "lockoutModal";
    modal.className = "modal lockout hidden";
    modal.innerHTML = `
      <div class="modal-card lockout-card">
        <h2>Account locked</h2>
        <p>Behavioural confidence dropped below the safe threshold. Enter your
        recovery key to restore access.</p>
        <div class="field"><input id="recoveryInput" type="password" placeholder="Recovery key"></div>
        <div id="recoveryError" class="recovery-error" style="display:none">Incorrect recovery key.</div>
        <div class="row">
          <button id="recoveryConfirm" class="btn block">Unlock</button>
        </div>
        <button id="recoverySignout" class="btn ghost block" style="margin-top:10px">Sign out instead</button>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove("hidden");
  $("recoveryInput").value = "";
  $("recoveryError").style.display = "none";

  $("recoveryConfirm").onclick = async ()=>{
    const ok = await RecoveryKey.verify($("recoveryInput").value.trim());
    if(ok){
      modal.classList.add("hidden");

      // Bug fix: clear the rolling buffer so the next prediction doesn't
      // immediately re-score the same behaviour that caused the lockout,
      // and hold a grace floor so a shaky read right after recovery can't
      // instantly slam trust back into RESTRICT/LOCK (see mlAdapter.js).
      if(typeof Collector !== "undefined") Collector.resetBuffer();
      AppState.ml.recoveryGraceUntil = Date.now() + CONFIG.RECOVERY_GRACE_MS;

      TrustController.setTrust(Math.max(75, CONFIG.RECOVERY_GRACE_FLOOR));
      AppState.ml.lastSignalAt = Date.now();
      addSecurityEvent("Recovered via secret key \u2014 access restored", "success");
      addAudit("Recovery key verified");
      showToast("Access restored","success");
    } else {
      $("recoveryError").style.display = "block";
      addSecurityEvent("Recovery key attempt failed", "danger");
    }
  };
  $("recoverySignout").onclick = ()=> Session.logout();
}