"""
app.py  --  Stage 7: serve the trained model to the frontend.

Run:
    python app.py
    (loads model_out/model.pkl, scaler.pkl, calibration.json by default)

Env vars:
    MODEL_DIR              default "model_out"
    TRUST_SMOOTHING_ALPHA  default 0.4  (0 < alpha <= 1; lower = smoother/slower
                            to react, higher = snappier/noisier. 1.0 disables
                            smoothing entirely.)

Endpoints:
    GET  /health    collector/model health for the Research Console
    POST /predict   {"features": {...37 keys...}} -> the exact contract
                     mlAdapter.js already expects
    POST /reset      clears the smoothing state (call this on login)
    POST /api/recovery-key           save/overwrite the owner recovery key
                                      (Argon2id hash only, never plaintext)
    POST /api/recovery-key/verify    verify an attempted recovery key,
                                      used to clear a full lockout
    GET  /api/recovery-key/status    whether a recovery key has been set yet

Why smoothing: the held-out evaluation showed ~23% of genuine sessions can
dip below the step-up threshold in a single snapshot (FRR). In CONTINUOUS
auth a new snapshot arrives every couple of seconds, so one noisy window
should not visibly yank the live policy. An exponential moving average over
consecutive predictions absorbs that jitter without hiding genuine drift.
"""

import json
import os
import pickle
from pathlib import Path
import sys

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml_pipeline.feature_extractor import FEATURE_KEYS
from ml_pipeline.train_model import band_of, band_labels, trust_from_score

# --- recovery key: Argon2id hashing + SQLite storage (see recovery_key_store.py) ---
from server.recovery_key_store import set_recovery_key, verify_recovery_key, has_recovery_key_set

# --- login credentials: Argon2id hashing + SQLite storage (see credentials_store.py) ---
from server.credentials_store import (
    set_credentials, verify_credentials, get_username,
    has_credentials_set, set_username_only,
)

MODEL_DIR = Path(os.environ.get("MODEL_DIR", ROOT_DIR / "model_out"))
ALPHA = float(os.environ.get("TRUST_SMOOTHING_ALPHA", "0.4"))
if not (0 < ALPHA <= 1):
    raise ValueError("TRUST_SMOOTHING_ALPHA must be in (0, 1]")

app = Flask(__name__)
CORS(app)  # the static frontend runs on a different origin (file:// or :5500)

with open(MODEL_DIR / "model.pkl", "rb") as f:
    MODEL = pickle.load(f)
with open(MODEL_DIR / "scaler.pkl", "rb") as f:
    SCALER = pickle.load(f)
with open(MODEL_DIR / "calibration.json") as f:
    CALIB = json.load(f)
try:
    with open(MODEL_DIR / "stats.json") as f:
        STATS = json.load(f)
except FileNotFoundError:
    STATS = {}

# Single-owner prototype -> one global smoothing state is the right scope
# (this is a per-laptop continuous-auth demo, not a multi-tenant service).
_state = {"ema_trust": None}


def smooth(raw_trust):
    if _state["ema_trust"] is None:
        _state["ema_trust"] = raw_trust
    else:
        _state["ema_trust"] = ALPHA * raw_trust + (1 - ALPHA) * _state["ema_trust"]
    return _state["ema_trust"]


def score_features(feature_dict):
    missing = [k for k in FEATURE_KEYS if k not in feature_dict]
    if missing:
        raise ValueError(f"missing features: {missing}")
    x = np.array([[float(feature_dict[k]) for k in FEATURE_KEYS]], dtype=float)
    x_s = SCALER.transform(x)
    raw_score = float(MODEL.decision_function(x_s)[0])
    raw_trust = float(trust_from_score(raw_score, CALIB["low_anchor"], CALIB["high_anchor"]))
    return raw_score, raw_trust


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": MODEL is not None,
        "genuine_train_size": STATS.get("dataset", {}).get("genuine_train"),
        "roc_auc": STATS.get("roc_auc"),
        "smoothing_alpha": ALPHA,
    })


@app.route("/reset", methods=["POST"])
def reset():
    _state["ema_trust"] = None
    return jsonify({"reset": True})


@app.route("/predict", methods=["POST"])
def predict():
    body = request.get_json(silent=True) or {}
    feats = body.get("features")
    if not isinstance(feats, dict):
        return jsonify({"error": "expected JSON body {'features': {...37 keys...}}"}), 400

    try:
        raw_score, raw_trust = score_features(feats)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"scoring failed: {e}"}), 500

    smoothed = smooth(raw_trust)
    band = band_of(smoothed)
    pred, risk = band_labels(band)

    return jsonify({
        "trust": round(smoothed, 1),
        "prediction": pred,
        "confidence": round(smoothed / 100, 3),
        "risk": risk,
        "anomaly_score": round(raw_score, 4),
        "raw_trust": round(raw_trust, 1),   # debugging aid, not required by the frontend
    })


# --------------------------------------------------------------------------
# Recovery key endpoints (Objective 4: tamper-resistant, fail-closed recovery)
#
# The plaintext key is only ever present in this request's body, in memory,
# for the duration of hashing/verification -- it is never logged, never
# written to disk, and never sent back in any response.
# --------------------------------------------------------------------------

@app.route("/api/recovery-key", methods=["POST"])
def save_recovery_key():
    body = request.get_json(silent=True) or {}
    key = body.get("key", "")
    current_key = body.get("currentKey", "")
    if has_recovery_key_set() and not verify_recovery_key(current_key):
        return jsonify({"ok": False, "error": "Current recovery key is incorrect."}), 403
    try:
        set_recovery_key(key)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"failed to save recovery key: {e}"}), 500
    return jsonify({"ok": True})


@app.route("/api/recovery-key/verify", methods=["POST"])
def check_recovery_key():
    body = request.get_json(silent=True) or {}
    key = body.get("key", "")
    ok = verify_recovery_key(key)
    return jsonify({"ok": ok})


@app.route("/api/recovery-key/status", methods=["GET"])
def recovery_key_status():
    return jsonify({"isSet": has_recovery_key_set()})


# --------------------------------------------------------------------------
# Login credential endpoints (username + Argon2id-hashed password, SQLite)
#
# The plaintext password is only ever present in this request's body, in
# memory, for the duration of hashing/verification -- never logged, never
# written to disk, never sent back in any response.
# --------------------------------------------------------------------------

@app.route("/api/credentials", methods=["POST"])
def save_credentials():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "")
    password = body.get("password", "")
    current_password = body.get("currentPassword", "")
    if has_credentials_set() and not verify_credentials(get_username(), current_password):
        return jsonify({"ok": False, "error": "Current password is incorrect."}), 403
    try:
        set_credentials(username, password)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"failed to save credentials: {e}"}), 500
    return jsonify({"ok": True})


@app.route("/api/credentials/username", methods=["POST"])
def rename_username():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "")
    current_password = body.get("currentPassword", "")
    if has_credentials_set() and not verify_credentials(get_username(), current_password):
        return jsonify({"ok": False, "error": "Current password is incorrect."}), 403
    try:
        set_username_only(username)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    return jsonify({"ok": True})


@app.route("/api/credentials/verify", methods=["POST"])
def check_credentials():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "")
    password = body.get("password", "")
    ok = verify_credentials(username, password)
    return jsonify({"ok": ok})


@app.route("/api/credentials/status", methods=["GET"])
def credentials_status():
    return jsonify({
        "isSet": has_credentials_set(),
        "username": get_username(),  # not secret, safe to expose
    })


def main():
    app.run(host="127.0.0.1", port=5000, debug=False)


if __name__ == "__main__":
    main()
