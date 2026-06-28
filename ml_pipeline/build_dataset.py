"""
build_dataset.py  --  Stage 2: raw session parquet folder(s) -> one clean feature table.

Usage:
    python build_dataset.py --genuine-dir data/sessions_me --out genuine.parquet
    python build_dataset.py --negative-dir data/hardnegative_sessions --out hardnegative.parquet
    python build_dataset.py --genuine-dir data/sessions_me --negative-dir data/sessions_friend --out dataset.parquet

What it does to every .parquet file it finds:
  1. Try to read it. Unreadable/truncated files (collector killed mid-flush) are
     counted and skipped -- not fatal.
  2. Run it through feature_extractor.py (the SAME extractor proven to match the
     browser in Stage 1).
  3. Drop sessions that are too short to give stable features (< MIN_EVENTS).
  4. Drop sessions with impossible values (e.g. multi-year "duration" from a
     corrupted timestamp).
  5. Keep the rest, tagged with source=genuine/negative/hardnegative and label=1/0.

Prints a summary so you know exactly how many sessions survived and why any
were dropped -- no silent data loss.
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

try:
    from .feature_extractor import FEATURE_KEYS, extract_features, normalize_raw_events
except ImportError:
    from feature_extractor import FEATURE_KEYS, extract_features, normalize_raw_events

MIN_EVENTS = 60          # sessions shorter than this are too noisy to trust
MAX_DURATION_SEC = 3600  # 1 hour; anything beyond this is almost certainly a
                          # corrupted/garbage timestamp, not a real session


def process_file(path):
    """Returns (features_dict, reject_reason) -- exactly one of them is set."""
    try:
        df = pd.read_parquet(path)
    except Exception as e:
        return None, f"unreadable ({type(e).__name__})"

    if not {"timestamp", "event"}.issubset(df.columns):
        return None, "missing expected columns"

    rows = df.to_dict("records")
    events = normalize_raw_events(rows)

    if len(events) < MIN_EVENTS:
        return None, f"too short ({len(events)} events < {MIN_EVENTS})"

    feats = extract_features(events)

    if feats["duration"] <= 0 or feats["duration"] > MAX_DURATION_SEC:
        return None, f"impossible duration ({feats['duration']:.1f}s)"

    return feats, None


def scan_dir(dir_path, source_label, label_value):
    dir_path = Path(dir_path)
    files = sorted(dir_path.glob("*.parquet"))
    rows, rejects = [], {}

    for f in files:
        feats, reason = process_file(f)
        if feats is None:
            rejects[reason] = rejects.get(reason, 0) + 1
            continue
        feats["session_id"] = f.name
        feats["source"] = source_label
        feats["label"] = label_value
        rows.append(feats)

    return rows, rejects, len(files)


def print_summary(name, total, kept, rejects):
    print(f"\n[{name}]")
    print(f"  found:   {total}")
    print(f"  kept:    {kept}")
    print(f"  dropped: {total - kept}")
    for reason, count in sorted(rejects.items(), key=lambda kv: -kv[1]):
        print(f"    - {reason}: {count}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--genuine-dir", help="folder of YOUR raw session .parquet files")
    ap.add_argument("--negative-dir", help="folder of impostor/hard-negative raw session .parquet files")
    ap.add_argument("--out", required=True, help="output .parquet path for the combined feature table")
    args = ap.parse_args()

    if not args.genuine_dir and not args.negative_dir:
        ap.error("at least one of --genuine-dir or --negative-dir is required")

    all_rows = []

    if args.genuine_dir:
        g_rows, g_rej, g_total = scan_dir(args.genuine_dir, "genuine", 1)
        all_rows += g_rows
        print_summary("genuine", g_total, len(g_rows), g_rej)

    if args.negative_dir:
        negative_source = (
            "hardnegative"
            if "hard" in Path(args.negative_dir).name.lower()
            else "negative"
        )
        n_rows, n_rej, n_total = scan_dir(args.negative_dir, negative_source, 0)
        all_rows += n_rows
        print_summary(negative_source, n_total, len(n_rows), n_rej)

    if not all_rows:
        print("\nNo sessions survived cleaning -- nothing to write.")
        sys.exit(1)

    out_df = pd.DataFrame(all_rows)
    # column order: session_id, source, label, then the 37 features
    ordered = ["session_id", "source", "label"] + FEATURE_KEYS
    out_df = out_df[ordered]
    out_df.to_parquet(args.out, index=False)

    print(f"\nWrote {len(out_df)} sessions -> {args.out}")
    print(out_df["label"].value_counts().rename({1: "genuine", 0: "negative"}).to_string())


if __name__ == "__main__":
    main()
