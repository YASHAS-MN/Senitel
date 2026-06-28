"""
feature_extractor.py  --  Stage 1 canonical feature extractor (Python side)

Mirrors the browser's featureExtractor.js EXACTLY so that the offline training
features and the live browser features are the same 37 numbers in the same raw
units (pixels / seconds / counts). Train on these; serve on these.

Input: raw collector parquet rows with columns [timestamp, event, x, y], where
`event` is one of: move, click_Button.left, click_Button.right, scroll,
keydown, keyup  (exactly what behavioral_collector.py writes).

Parity rules baked in (see ML_Recovery_Plan Stage 1):
  - position stats use `move` events only
  - `scroll` rows carry dx,dy in x,y -> dropped, never used as coordinates
  - click_Button.left / click_Button.right -> normalized to a single "click"
  - all timing in seconds, from the `timestamp` column
No scaling/normalization here. Scaling is a later, persisted step.
"""

import math
import json
import argparse
from pathlib import Path

# Must match FEATURE_KEYS in appState.js, in order.
FEATURE_KEYS = [
    "total_events", "duration", "avg_dt", "std_dt",
    "pause_1s_count", "pause_5s_count", "pause_10s_count",
    "missing_xy_count", "missing_xy_ratio", "duplicate_ratio",
    "x_min", "x_max", "x_mean", "x_std", "x_range",
    "y_min", "y_max", "y_mean", "y_std", "y_range",
    "total_move_distance", "avg_move_step", "move_count", "move_ratio",
    "move_duration", "avg_move_speed", "move_speed_std",
    "count_move", "count_click", "count_keydown", "count_keyup", "count_scroll",
    "ratio_move", "ratio_click", "ratio_keydown", "ratio_keyup", "ratio_scroll",
]


def empty_features():
    return {k: 0 for k in FEATURE_KEYS}


def _mean(arr):
    return sum(arr) / len(arr) if arr else 0.0


def _std(arr, m):
    # population std (divide by N), identical to the JS implementation
    if not arr:
        return 0.0
    v = sum((x - m) * (x - m) for x in arr) / len(arr)
    return math.sqrt(v)


def normalize_raw_events(rows):
    """
    rows: iterable of dicts/records with keys timestamp, event, x, y.
    Returns canonical events: {type, t (ms), x, y} matching the browser buffer.
    """
    events = []
    for r in rows:
        ev = str(r["event"])
        if ev == "move":
            etype, x, y = "move", _num(r.get("x")), _num(r.get("y"))
        elif ev.startswith("click"):           # click_Button.left / .right
            etype, x, y = "click", _num(r.get("x")), _num(r.get("y"))
        elif ev == "scroll":                    # x,y here are dx,dy -> drop
            etype, x, y = "scroll", None, None
        elif ev == "keydown":
            etype, x, y = "keydown", None, None
        elif ev == "keyup":
            etype, x, y = "keyup", None, None
        else:
            continue                            # unknown event type, ignore
        events.append({"type": etype, "t": float(r["timestamp"]) * 1000.0,
                       "x": x, "y": y})
    # keep chronological order, exactly like the live buffer
    events.sort(key=lambda e: e["t"])
    return events


def _num(v):
    try:
        if v is None:
            return None
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def extract_features(events):
    """events: list of {type, t(ms), x, y}. Returns the 37-feature dict."""
    out = empty_features()
    total = len(events)
    out["total_events"] = total
    if total == 0:
        return out

    out["duration"] = max(0.0, (events[-1]["t"] - events[0]["t"]) / 1000.0)

    dts = [(events[i]["t"] - events[i - 1]["t"]) / 1000.0 for i in range(1, total)]
    out["avg_dt"] = _mean(dts)
    out["std_dt"] = _std(dts, out["avg_dt"])
    out["pause_1s_count"] = sum(1 for d in dts if d > 1)
    out["pause_5s_count"] = sum(1 for d in dts if d > 5)
    out["pause_10s_count"] = sum(1 for d in dts if d > 10)

    moves = [e for e in events if e["type"] == "move" and isinstance(e["x"], (int, float))]
    missing = total - len(moves)
    out["missing_xy_count"] = missing
    out["missing_xy_ratio"] = missing / total if total else 0.0

    dup = sum(1 for i in range(1, len(moves))
              if moves[i]["x"] == moves[i - 1]["x"] and moves[i]["y"] == moves[i - 1]["y"])
    out["duplicate_ratio"] = dup / len(moves) if moves else 0.0

    xs = [m["x"] for m in moves]
    ys = [m["y"] for m in moves]
    if xs:
        out["x_min"], out["x_max"] = min(xs), max(xs)
        out["x_mean"] = _mean(xs); out["x_std"] = _std(xs, out["x_mean"])
        out["x_range"] = out["x_max"] - out["x_min"]
        out["y_min"], out["y_max"] = min(ys), max(ys)
        out["y_mean"] = _mean(ys); out["y_std"] = _std(ys, out["y_mean"])
        out["y_range"] = out["y_max"] - out["y_min"]

    dist = 0.0
    speeds = []
    for i in range(1, len(moves)):
        dx = moves[i]["x"] - moves[i - 1]["x"]
        dy = moves[i]["y"] - moves[i - 1]["y"]
        d = math.sqrt(dx * dx + dy * dy)
        dist += d
        dt = (moves[i]["t"] - moves[i - 1]["t"]) / 1000.0
        if dt > 0:
            speeds.append(d / dt)

    out["total_move_distance"] = dist
    out["move_count"] = len(moves)
    out["avg_move_step"] = dist / (len(moves) - 1) if len(moves) > 1 else 0.0
    out["move_ratio"] = len(moves) / total if total else 0.0
    out["move_duration"] = max(0.0, (moves[-1]["t"] - moves[0]["t"]) / 1000.0) if len(moves) > 1 else 0.0
    out["avg_move_speed"] = dist / out["move_duration"] if out["move_duration"] > 0 else 0.0
    out["move_speed_std"] = _std(speeds, _mean(speeds))

    def count_of(t):
        return sum(1 for e in events if e["type"] == t)

    out["count_move"] = len(moves)
    out["count_click"] = count_of("click")
    out["count_keydown"] = count_of("keydown")
    out["count_keyup"] = count_of("keyup")
    out["count_scroll"] = count_of("scroll")
    out["ratio_move"] = out["count_move"] / total if total else 0.0
    out["ratio_click"] = out["count_click"] / total if total else 0.0
    out["ratio_keydown"] = out["count_keydown"] / total if total else 0.0
    out["ratio_keyup"] = out["count_keyup"] / total if total else 0.0
    out["ratio_scroll"] = out["count_scroll"] / total if total else 0.0
    return out


def extract_from_parquet(path):
    """Read one raw session parquet and return its 37-feature dict."""
    import pandas as pd
    df = pd.read_parquet(path)
    rows = df.to_dict("records")
    return extract_features(normalize_raw_events(rows))


def extract_from_event_json(path):
    """Read a list of raw events from JSON (used by the parity check)."""
    rows = json.loads(Path(path).read_text())
    return extract_features(normalize_raw_events(rows))


def main():
    ap = argparse.ArgumentParser(description="Extract 37 behavioural features from a raw session.")
    ap.add_argument("path", help="raw .parquet session file, or .json list of raw events")
    args = ap.parse_args()
    p = Path(args.path)
    feats = extract_from_event_json(p) if p.suffix == ".json" else extract_from_parquet(p)
    print(json.dumps(feats, indent=2))


if __name__ == "__main__":
    main()
