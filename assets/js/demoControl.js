/* ============================================================
   demoControl.js — simulation-only presenter lever
   The trust SLIDER stands in for the model (no ML yet, by design
   this phase). The "Collector signal" switch now controls the
   REAL Collector's pause/resume — toggling it off genuinely stops
   behavioural evidence from arriving, which is what should make
   trust decay via MLAdapter's fail-closed heartbeat.
   Hidden entirely when CONFIG.SIMULATION is false.
   ============================================================ */

const DemoControl = {
  signalOn: true,
  syncTimer: null,

  mount(){
    if(!CONFIG.SIMULATION) return;

    const box = document.createElement("div");
    box.className = "demo-ctl";
    box.innerHTML = `
      <h4>Demo Control</h4>
      <div class="hint">Trust slider stands in for the model (pre-ML phase)</div>
      <div class="trustnum"><span id="demoTrustNum">100</span>%</div>
      <input id="demoTrust" type="range" min="0" max="100" value="100">
      <label class="toggle">
        <input id="demoSignal" type="checkbox" checked>
        <span>Collector signal</span>
      </label>
      <small>Turning this off pauses the REAL behavioural collector. With
      no evidence arriving, trust decays on its own \u2014 fail-closed \u2014
      toward Session Locked, regardless of the slider.</small>
    `;
    document.body.appendChild(box);

    const slider = $("demoTrust");
    const num    = $("demoTrustNum");
    slider.addEventListener("input", ()=>{
      num.textContent = slider.value;
      TrustController.setTrust(+slider.value);
    });

    $("demoSignal").addEventListener("change", e=>{
      this.signalOn = e.target.checked;
      if(this.signalOn){
        Collector.resume();
        addSecurityEvent("Collector signal restored", "success");
      } else {
        Collector.pause();
        addSecurityEvent("Collector signal cut by presenter", "warning");
      }
    });

    // UI-only sync: keep the slider honest if trust changes elsewhere
    // (e.g. fail-closed decay, or a successful recovery-key unlock).
    this.syncTimer = setInterval(()=>{
      if(document.activeElement !== slider){
        slider.value = AppState.ml.trust;
        num.textContent = AppState.ml.trust;
      }
    }, CONFIG.HEARTBEAT_MS);
  }
};
