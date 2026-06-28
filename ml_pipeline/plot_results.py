"""
plot_results.py -- generates the two evaluation plots that need the REAL
saved model and REAL data (not derivable from the summary numbers alone):
  1. ROC curve (full curve, not just the single AUC number)
  2. Genuine-session trust distribution across all four policy bands
  3. (bonus) Trust score histogram, genuine vs negative, overlaid

This re-scores your EXISTING model.pkl/scaler.pkl against genuine.parquet /
hardnegative.parquet using the SAME train/test split as train_model.py
(same RANDOM_STATE, same TEST_FRACTION) -- so the genuine_test set here is
EXACTLY the held-out set your model was actually evaluated on. Nothing is
retrained; nothing is synthetic.

Usage:
    python plot_results.py --genuine genuine.parquet --negative hardnegative.parquet --model-dir model_out --out-dir figures
"""

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_curve, roc_auc_score

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

try:
    from .feature_extractor import FEATURE_KEYS
    from .train_model import RANDOM_STATE, TEST_FRACTION, OPERATING_TRUST_CUT, band_of, trust_from_score
except ImportError:
    from feature_extractor import FEATURE_KEYS
    from train_model import RANDOM_STATE, TEST_FRACTION, OPERATING_TRUST_CUT, band_of, trust_from_score

SIGNATURE, BRASS, RUST, SEAL, INK = "#1F6F5C", "#A6772B", "#A14E2A", "#8B2635", "#10172A"
plt.rcParams.update({"font.size": 11, "axes.edgecolor": "#444444", "axes.linewidth": .8})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--genuine", required=True)
    ap.add_argument("--negative", required=True)
    ap.add_argument("--model-dir", default="model_out")
    ap.add_argument("--out-dir", default="figures")
    args = ap.parse_args()

    out_dir = Path(args.out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    model_dir = Path(args.model_dir)

    with open(model_dir / "model.pkl", "rb") as f: model = pickle.load(f)
    with open(model_dir / "scaler.pkl", "rb") as f: scaler = pickle.load(f)
    with open(model_dir / "calibration.json") as f: calib = json.load(f)

    genuine_df = pd.read_parquet(args.genuine)
    negative_df = pd.read_parquet(args.negative)

    X_genuine = genuine_df[FEATURE_KEYS].to_numpy(dtype=float)
    X_negative = negative_df[FEATURE_KEYS].to_numpy(dtype=float)

    # EXACT same split as train_model.py -- reproduces the real held-out set
    rng = np.random.RandomState(RANDOM_STATE)
    idx = rng.permutation(len(X_genuine))
    n_test = max(1, int(len(idx) * TEST_FRACTION))
    test_idx = idx[:n_test]
    X_test = X_genuine[test_idx]

    X_test_s = scaler.transform(X_test)
    X_neg_s = scaler.transform(X_negative)
    test_scores = model.decision_function(X_test_s)
    neg_scores = model.decision_function(X_neg_s)

    test_trust = trust_from_score(test_scores, calib["low_anchor"], calib["high_anchor"])
    neg_trust = trust_from_score(neg_scores, calib["low_anchor"], calib["high_anchor"])

    y_true = np.concatenate([np.ones_like(test_trust), np.zeros_like(neg_trust)])
    y_score = np.concatenate([test_trust, neg_trust])
    auc = roc_auc_score(y_true, y_score)
    fpr, tpr, _ = roc_curve(y_true, y_score)

    # ---- Figure C: ROC curve ----
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.plot(fpr, tpr, color=SIGNATURE, linewidth=2.2, label=f"Model (AUC = {auc:.4f})")
    ax.plot([0, 1], [0, 1], color="#aaaaaa", linestyle="--", linewidth=1, label="Chance (AUC = 0.50)")
    ax.set_xlabel("False Positive Rate  (impostor wrongly trusted)")
    ax.set_ylabel("True Positive Rate  (owner correctly trusted)")
    ax.set_title("Figure C \u2014 ROC Curve\nGenuine (held-out) vs. real impostor sessions")
    ax.legend(loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(out_dir / "fig_C_roc_curve.png", dpi=200, bbox_inches="tight")
    plt.close(fig)

    # ---- Figure D: genuine trust across all 4 policy bands ----
    bands = ["FULL", "STEPUP", "RESTRICT", "LOCK"]
    band_names = ["Full\nAccess", "Step-up", "Restricted", "Locked"]
    colors = [SIGNATURE, BRASS, RUST, SEAL]
    genuine_bands = [band_of(t) for t in test_trust]
    neg_bands = [band_of(t) for t in neg_trust]
    g_counts = [genuine_bands.count(b) for b in bands]
    n_counts = [neg_bands.count(b) for b in bands]

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.2), sharey=False)
    bars = axes[0].bar(band_names, g_counts, color=colors, width=.6)
    for b, c in zip(bars, g_counts):
        axes[0].text(b.get_x()+b.get_width()/2, c+max(g_counts)*.02, f"{c/len(test_trust)*100:.1f}%",
                     ha="center", fontsize=9.5, fontweight="bold", color=INK)
    axes[0].set_title(f"Genuine held-out sessions (n={len(test_trust)})")
    axes[0].set_ylabel("Sessions")
    axes[0].spines[["top","right"]].set_visible(False)

    bars2 = axes[1].bar(band_names, n_counts, color=colors, width=.6)
    for b, c in zip(bars2, n_counts):
        axes[1].text(b.get_x()+b.get_width()/2, c+max(n_counts+[1])*.02, f"{c/len(neg_trust)*100:.1f}%",
                     ha="center", fontsize=9.5, fontweight="bold", color=INK)
    axes[1].set_title(f"Real impostor sessions (n={len(neg_trust)})")
    axes[1].spines[["top","right"]].set_visible(False)

    fig.suptitle("Figure D \u2014 Policy band distribution: genuine vs. impostor", fontsize=13)
    fig.tight_layout()
    fig.savefig(out_dir / "fig_D_band_distribution_both.png", dpi=200, bbox_inches="tight")
    plt.close(fig)

    # ---- Figure E (bonus): trust score histogram, overlaid ----
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    ax.hist(test_trust, bins=25, range=(0,100), alpha=.7, color=SIGNATURE, label=f"Genuine (n={len(test_trust)})")
    ax.hist(neg_trust, bins=25, range=(0,100), alpha=.7, color=SEAL, label=f"Impostor (n={len(neg_trust)})")
    ax.axvline(OPERATING_TRUST_CUT, color=INK, linestyle="--", linewidth=1.3,
               label=f"Operating threshold ({OPERATING_TRUST_CUT})")
    ax.set_xlabel("Trust score")
    ax.set_ylabel("Number of sessions")
    ax.set_title("Figure E \u2014 Trust score distribution")
    ax.legend()
    ax.spines[["top","right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(out_dir / "fig_E_trust_histogram.png", dpi=200, bbox_inches="tight")
    plt.close(fig)

    print(f"ROC-AUC: {auc:.4f}")
    print(f"Genuine band distribution: {dict(zip(bands, g_counts))}")
    print(f"Negative band distribution: {dict(zip(bands, n_counts))}")
    print(f"\nSaved 3 figures to {out_dir}/:")
    print("  fig_C_roc_curve.png")
    print("  fig_D_band_distribution_both.png")
    print("  fig_E_trust_histogram.png")


if __name__ == "__main__":
    main()
