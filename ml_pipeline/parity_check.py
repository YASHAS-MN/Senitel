"""
parity_check.py  --  verify the browser and Python extractors agree.

Two modes:

1) Against a raw event JSON (list of {timestamp,event,x,y}) exported however you
   like, compared to a reference feature JSON:
       python parity_check.py --events session_raw.json --reference feats.json

2) Against a browser "Export Session" JSON (the button in the Research Console).
   That export already contains the 37 features the BROWSER computed. This script
   can't replay the browser's raw buffer (the export is post-aggregation), so for
   a true cross-check, also export the raw events. If you only have the browser
   feature export, this prints it so you can eyeball it next to a parquet you
   extract with feature_extractor.py for a similar session.

Recommended real-data check:
   - In the app, do a short, deliberate session, click "Export Session".
   - Note the time window; pull the matching raw parquet the collector wrote.
   - python parity_check.py --events <(parquet->json) --reference <browser_export.json>
   All 37 features should match within tolerance.
"""

import json
import argparse
from pathlib import Path

try:
    from .feature_extractor import FEATURE_KEYS, extract_features, normalize_raw_events
except ImportError:
    from feature_extractor import FEATURE_KEYS, extract_features, normalize_raw_events

TOL = 1e-6


def compare(a, b):
    rows, mism = [], []
    for k in FEATURE_KEYS:
        av, bv = float(a.get(k, 0)), float(b.get(k, 0))
        ok = abs(av - bv) <= TOL * (1 + abs(av))
        if not ok:
            mism.append(k)
        rows.append((k, av, bv, ok))
    return rows, mism


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", help="raw events JSON (list of {timestamp,event,x,y})")
    ap.add_argument("--reference", help="reference feature JSON to compare against "
                                        "(e.g. browser Export Session output)")
    args = ap.parse_args()

    if not args.events:
        raise SystemExit("Provide --events (raw events JSON) at minimum.")

    rows = json.loads(Path(args.events).read_text())
    py_feats = extract_features(normalize_raw_events(rows))

    if not args.reference:
        print(json.dumps(py_feats, indent=2))
        return

    ref = json.loads(Path(args.reference).read_text())
    # browser export wraps features alongside session_id/captured_at; flatten
    ref = {k: ref[k] for k in FEATURE_KEYS if k in ref}

    table, mism = compare(py_feats, ref)
    print(f"{'feature':22s}{'python':>16s}{'reference':>16s}   match")
    print("-" * 72)
    for k, a, b, ok in table:
        print(f"{k:22s}{a:16.6f}{b:16.6f}   {'OK' if ok else 'XXXX MISMATCH'}")
    print("-" * 72)
    print("MISMATCHES:", mism if mism else "NONE -- extractors agree")
    raise SystemExit(1 if mism else 0)


if __name__ == "__main__":
    main()
