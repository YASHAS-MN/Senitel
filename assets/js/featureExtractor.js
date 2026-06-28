/* ============================================================
   featureExtractor.js -- raw events -> the 37-feature schema
   Pure function. No DOM access here; Collector owns the DOM.

   Definitions (best-effort mapping from column names; confirm
   exact formulas against the original Python collector before
   resuming the ML milestone, so live + recorded data truly match):

   - avg_dt, std_dt, pause_Ns_count: inter-event timing, all events
   - x_min..y_range: position stats over "move" events only
   - duplicate_ratio: consecutive moves landing on the same pixel
   - total_move_distance, avg_move_speed: Euclidean path, px per sec
   - count_X, ratio_X: raw counts and shares per event type
   ============================================================ */

function mean(arr){ return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
function std(arr,m){
  if(!arr.length) return 0;
  const v = arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length;
  return Math.sqrt(v);
}

function extractFeatures(buffer){
  const events = buffer.slice();
  const out = emptyFeatures();
  const total = events.length;
  out.total_events = total;
  if(total === 0) return out;

  out.duration = Math.max(0, (events[total-1].t - events[0].t) / 1000);

  const dts = [];
  for(let i=1;i<total;i++) dts.push((events[i].t - events[i-1].t) / 1000);
  out.avg_dt = mean(dts);
  out.std_dt = std(dts, out.avg_dt);
  out.pause_1s_count  = dts.filter(d=>d>1).length;
  out.pause_5s_count  = dts.filter(d=>d>5).length;
  out.pause_10s_count = dts.filter(d=>d>10).length;

  const moves = events.filter(e=>e.type==="move" && typeof e.x === "number");
  const missing = total - moves.length;
  out.missing_xy_count = missing;
  out.missing_xy_ratio = total ? missing/total : 0;

  let dup = 0;
  for(let i=1;i<moves.length;i++){
    if(moves[i].x===moves[i-1].x && moves[i].y===moves[i-1].y) dup++;
  }
  out.duplicate_ratio = moves.length ? dup/moves.length : 0;

  const xs = moves.map(m=>m.x), ys = moves.map(m=>m.y);
  if(xs.length){
    out.x_min=Math.min(...xs); out.x_max=Math.max(...xs);
    out.x_mean=mean(xs); out.x_std=std(xs,out.x_mean); out.x_range=out.x_max-out.x_min;
    out.y_min=Math.min(...ys); out.y_max=Math.max(...ys);
    out.y_mean=mean(ys); out.y_std=std(ys,out.y_mean); out.y_range=out.y_max-out.y_min;
  }

  let dist = 0; const speeds = [];
  for(let i=1;i<moves.length;i++){
    const dx=moves[i].x-moves[i-1].x, dy=moves[i].y-moves[i-1].y;
    const d=Math.sqrt(dx*dx+dy*dy);
    dist += d;
    const dt=(moves[i].t-moves[i-1].t)/1000;
    if(dt>0) speeds.push(d/dt);
  }
  out.total_move_distance = dist;
  out.move_count = moves.length;
  out.avg_move_step = moves.length>1 ? dist/(moves.length-1) : 0;
  out.move_ratio = total ? moves.length/total : 0;
  out.move_duration = moves.length>1 ? Math.max(0,(moves[moves.length-1].t-moves[0].t)/1000) : 0;
  out.avg_move_speed = out.move_duration>0 ? dist/out.move_duration : 0;
  out.move_speed_std = std(speeds, mean(speeds));

  const countOf = type => events.filter(e=>e.type===type).length;
  out.count_move    = moves.length;
  out.count_click    = countOf("click");
  out.count_keydown  = countOf("keydown");
  out.count_keyup    = countOf("keyup");
  out.count_scroll   = countOf("scroll");
  out.ratio_move    = total ? out.count_move/total   : 0;
  out.ratio_click    = total ? out.count_click/total   : 0;
  out.ratio_keydown  = total ? out.count_keydown/total : 0;
  out.ratio_keyup    = total ? out.count_keyup/total   : 0;
  out.ratio_scroll   = total ? out.count_scroll/total  : 0;

  return out;
}
