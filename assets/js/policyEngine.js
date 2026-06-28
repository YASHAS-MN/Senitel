/* ============================================================
   policyEngine.js — the ONE policy engine
   Replaces policy.js, the old policyEngine.js, and the inline
   copies in research.js / researcher.js. One band table, one set
   of labels, subscribed to TrustController.
   ============================================================ */

const PolicyEngine = {

  // Pure: trust -> policy descriptor. The single threshold table.
  evaluate(trust){
    if(trust >= 80) return {
      band:"FULL",      label:"Full Access",
      banner:"banner-ok",     bannerText:"Continuous authentication active \u2014 full access",
      transfer:"enabled", addBeneficiary:true, stepUpAbove:Infinity, locked:false
    };
    if(trust >= 60) return {
      band:"STEPUP",    label:"Step-up Verification",
      banner:"banner-warn",   bannerText:"Confidence reduced \u2014 large transfers need verification",
      transfer:"verify",  addBeneficiary:true, stepUpAbove:BankDB.transferPolicy.verificationLimit, locked:false
    };
    if(trust >= 40) return {
      band:"RESTRICT",  label:"Restricted",
      banner:"banner-restrict", bannerText:"Suspicious behaviour \u2014 transfers restricted",
      transfer:"disabled", addBeneficiary:false, stepUpAbove:0, locked:false
    };
    return {
      band:"LOCK",      label:"Session Locked",
      banner:"banner-lock",   bannerText:"High risk \u2014 session locked pending verification",
      transfer:"disabled", addBeneficiary:false, stepUpAbove:0, locked:true
    };
  },

  current(){ return this.evaluate(AppState.ml.trust); },

  // Apply policy to whatever view is currently mounted (defensive).
  apply(data){
    const trust = data ? data.trust : AppState.ml.trust;
    const p = this.evaluate(trust);

    // Global degraded state when locked
    document.querySelector(".app")?.classList.toggle("locked", p.locked);

    // Trust banner (present on most pages)
    const banner = $("trustBanner");
    if(banner){
      banner.className = "trust-banner " + p.banner;
      banner.innerHTML = `<span class="dot"></span>${signatureWaveHTML()}<span class="banner-text">${p.bannerText}</span>`;
      setSignatureBand(banner.querySelector(".signature-wave"), p.band);
    }

    // Transfer button
    const tBtn = $("transferButton");
    if(tBtn){
      if(p.transfer === "enabled"){ tBtn.disabled=false; tBtn.textContent="Transfer Now"; }
      else if(p.transfer === "verify"){ tBtn.disabled=false; tBtn.textContent="Transfer (verification may be required)"; }
      else if(p.band==="LOCK"){ tBtn.disabled=true; tBtn.textContent="Session Locked"; }
      else { tBtn.disabled=true; tBtn.textContent="Transfer Restricted"; }
    }

    // Add-beneficiary button
    const bBtn = $("addBeneficiaryButton");
    if(bBtn){
      bBtn.disabled = !p.addBeneficiary;
      bBtn.textContent = p.addBeneficiary ? "+ Add Beneficiary" : "Restricted";
    }

    // Policy status labels (dashboard / research)
    $("policyStatus") && ($("policyStatus").textContent = p.label);
    $("socPolicy")    && ($("socPolicy").textContent    = p.label);

    return p;
  }
};

TrustController.subscribe(d => PolicyEngine.apply(d));