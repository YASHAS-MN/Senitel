"""
train_model.py  --  Stages 4-6: scale, train, calibrate trust, evaluate.

Usage:
    python train_model.py --genuine genuine.parquet --negative hardnegative.parquet --out-dir model_out

What it does, in order:
  4. Split genuine into train/test. Fit a RobustScaler on genuine-TRAIN only
     (robust to the outlier-heavy nature of behavioural features). Persist it.
  5. Train IsolationForest on scaled genuine-TRAIN only. Negatives are NEVER
     used to fit anything -- only to calibrate the trust scale and evaluate.
  6. Calibrate score -> trust (0-100):
       low_anchor  = median decision_function score of the NEGATIVE set
       high_anchor = median decision_function score of GENUINE-TRAIN
       trust(score) = 100 * clip((score - low_anchor) / (high_anchor - low_anchor), 0, 1)
     So a typical genuine session lands near 100, a typical real impostor
     session lands near 0, by construction -- not by accident of percentile.
     Evaluate on genuine-TEST (held out) + negatives: ROC-AUC, FAR/FRR at the
     trust=60 operating point (the line between Step-up and Restricted), and
     how each set distributes across the four policy bands.

Outputs into --out-dir:
  model.pkl        the fitted IsolationForest
  scaler.pkl        the fitted RobustScaler (MUST be applied before scoring)
  calibration.json  {low_anchor, high_anchor} -- needed to turn a score into trust
  stats.json        evaluation report (feeds the Research Console's pending panel)
"""

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import roc_auc_score, confusion_matrix

try:
    from .feature_extractor import FEATURE_KEYS
except ImportError:
    from feature_extractor import FEATURE_KEYS

RANDOM_STATE = 42
TEST_FRACTION = 0.2
OPERATING_TRUST_CUT = 60   # matches the frontend's Step-up/Restricted boundary


def band_of(trust):
    if trust >= 80: return "FULL"
    if trust >= 60: return "STEPUP"
    if trust >= 40: return "RESTRICT"
    return "LOCK"


def band_labels(band):
    labels = {
        "FULL": ("GENUINE USER", "LOW"),
        "STEPUP": ("LIKELY GENUINE", "MEDIUM"),
        "RESTRICT": ("SUSPICIOUS", "HIGH"),
        "LOCK": ("HIGH RISK", "CRITICAL"),
    }
    return labels[band]


def trust_from_score(score, low_anchor, high_anchor):
    span = high_anchor - low_anchor
    if span <= 0:
        return np.zeros_like(score) if hasattr(score, "__len__") else 0.0
    pct = (score - low_anchor) / span
    return np.clip(pct, 0, 1) * 100


def train(genuine_df, negative_df, out_dir, random_state=RANDOM_STATE):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    X_genuine = genuine_df[FEATURE_KEYS].to_numpy(dtype=float)
    X_negative = negative_df[FEATURE_KEYS].to_numpy(dtype=float)

    rng = np.random.RandomState(random_state)
    idx = rng.permutation(len(X_genuine))
    n_test = max(1, int(len(idx) * TEST_FRACTION))
    test_idx, train_idx = idx[:n_test], idx[n_test:]
    X_train, X_test = X_genuine[train_idx], X_genuine[test_idx]

    # Stage 4: scale on genuine-train ONLY
    scaler = RobustScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)
    X_neg_s = scaler.transform(X_negative)

    # Stage 5: train on genuine-train ONLY
    model = IsolationForest(n_estimators=200, contamination="auto",
                             random_state=random_state)
    model.fit(X_train_s)

    # Stage 6: calibrate using train + negatives (NOT used to fit the model)
    train_scores = model.decision_function(X_train_s)
    test_scores = model.decision_function(X_test_s)
    neg_scores = model.decision_function(X_neg_s)

    low_anchor = float(np.median(neg_scores))
    high_anchor = float(np.median(train_scores))
    if high_anchor <= low_anchor:
        # Defensive: if anchors are inverted/degenerate, fall back to a span
        # derived from the train distribution so trust stays well-defined.
        high_anchor = low_anchor + max(1e-6, np.std(train_scores) * 4)

    test_trust = trust_from_score(test_scores, low_anchor, high_anchor)
    neg_trust = trust_from_score(neg_scores, low_anchor, high_anchor)

    # Evaluation
    y_true = np.concatenate([np.ones_like(test_trust), np.zeros_like(neg_trust)])
    y_score = np.concatenate([test_trust, neg_trust])
    auc = float(roc_auc_score(y_true, y_score))

    allowed_test = (test_trust >= OPERATING_TRUST_CUT)
    allowed_neg = (neg_trust >= OPERATING_TRUST_CUT)
    frr = float(np.mean(~allowed_test))   # genuine wrongly restricted/locked
    far = float(np.mean(allowed_neg))     # impostor wrongly allowed

    y_pred = np.concatenate([allowed_test, allowed_neg]).astype(int)
    y_actual = np.concatenate([np.ones_like(allowed_test), np.zeros_like(allowed_neg)]).astype(int)
    cm = confusion_matrix(y_actual, y_pred, labels=[1, 0]).tolist()  # rows/cols: [genuine, negative]

    def band_counts(trust_arr):
        bands = [band_of(t) for t in trust_arr]
        return {b: bands.count(b) for b in ["FULL", "STEPUP", "RESTRICT", "LOCK"]}

    stats = {
        "dataset": {
            "genuine_total": len(X_genuine),
            "genuine_train": len(X_train),
            "genuine_test": len(X_test),
            "negative_total": len(X_negative),
        },
        "calibration": {"low_anchor": low_anchor, "high_anchor": high_anchor},
        "roc_auc": auc,
        "operating_point": {
            "trust_cut": OPERATING_TRUST_CUT,
            "false_reject_rate": frr,
            "false_accept_rate": far,
            "confusion_matrix_labels": ["genuine", "negative"],
            "confusion_matrix": cm,
        },
        "trust_distribution": {
            "genuine_test": band_counts(test_trust),
            "negative": band_counts(neg_trust),
        },
        "genuine_test_trust_summary": {
            "mean": float(np.mean(test_trust)), "median": float(np.median(test_trust)),
            "min": float(np.min(test_trust)), "max": float(np.max(test_trust)),
        },
        "negative_trust_summary": {
            "mean": float(np.mean(neg_trust)), "median": float(np.median(neg_trust)),
            "min": float(np.min(neg_trust)), "max": float(np.max(neg_trust)),
        },
    }

    with open(out_dir / "model.pkl", "wb") as f:
        pickle.dump(model, f)
    with open(out_dir / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(out_dir / "calibration.json", "w") as f:
        json.dump({"low_anchor": low_anchor, "high_anchor": high_anchor}, f, indent=2)
    with open(out_dir / "stats.json", "w") as f:
        json.dump(stats, f, indent=2)

    return stats


def predict_one(model, scaler, calibration, feature_dict):
    """What Flask will call per request. feature_dict has the 37 FEATURE_KEYS."""
    x = np.array([[feature_dict[k] for k in FEATURE_KEYS]], dtype=float)
    x_s = scaler.transform(x)
    score = model.decision_function(x_s)[0]
    trust = float(trust_from_score(score, calibration["low_anchor"], calibration["high_anchor"]))
    band = band_of(trust)
    risk = {"FULL": "LOW", "STEPUP": "MEDIUM", "RESTRICT": "HIGH", "LOCK": "CRITICAL"}[band]
    pred = {"FULL": "GENUINE USER", "STEPUP": "LIKELY GENUINE",
            "RESTRICT": "SUSPICIOUS", "LOCK": "HIGH RISK"}[band]
    return {
        "trust": round(trust, 1),
        "prediction": pred,
        "confidence": round(trust / 100, 3),
        "risk": risk,
        "anomaly_score": round(float(score), 4),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--genuine", required=True)
    ap.add_argument("--negative", required=True)
    ap.add_argument("--out-dir", default="model_out")
    args = ap.parse_args()

    genuine_df = pd.read_parquet(args.genuine)
    negative_df = pd.read_parquet(args.negative)

    stats = train(genuine_df, negative_df, args.out_dir)

    print(json.dumps(stats, indent=2))
    print(f"\nModel + scaler + calibration written to: {args.out_dir}/")


if __name__ == "__main__":
    main()
