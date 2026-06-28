# BankGuard

Continuous behavioural-authentication banking prototype.

The project now has three clear layers:

- `assets/` + `index.html` - static banking UI and live browser collector.
- `server/` - Flask API that serves the trained model.
- `ml_pipeline/` - dataset building, feature extraction, plotting, parity checking, and model training.
- `data/` - raw and processed datasets.
- `model_out/` - trained model artifacts.
- `reports/` - generated plots and reporting outputs.

## Run The Live App

Open two terminals from `C:\Prototypes\WEB_Lab`.

Terminal 1, start Flask:

```powershell
.\.venv\Scripts\python.exe -m server.app
```

Terminal 2, start the static app:

```powershell
.\.venv\Scripts\python.exe -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

The frontend posts live feature vectors to:

```text
http://127.0.0.1:5000/predict
```

## Project Layout

```text
WEB_Lab/
  index.html                  Static app shell
  assets/
    css/main.css              UI styles
    js/                       Browser app, collector, policy, views
  server/
    app.py                    Flask model API implementation
  ml_pipeline/
    feature_extractor.py      Canonical Python feature extractor
    build_dataset.py          Raw parquet sessions -> feature parquet
    train_model.py            Isolation Forest training + calibration
    plot_results.py           Evaluation plot generator
    parity_check.py           Browser/Python feature parity helper
  model_out/                  Trained model artifacts
  data/
    true_sessions/            Genuine raw sessions
    hardnegtive_sessions/     Hard-negative raw sessions
    processed/                Clean generated parquet datasets
  reports/
    figures/                  Generated evaluation plots
```

## ML Commands

Run these from the repo root:

```powershell
.\.venv\Scripts\python.exe -m ml_pipeline.build_dataset --genuine-dir data\true_sessions --out data\processed\genuine.parquet
.\.venv\Scripts\python.exe -m ml_pipeline.build_dataset --negative-dir data\hardnegtive_sessions --out data\processed\hardnegative.parquet
.\.venv\Scripts\python.exe -m ml_pipeline.train_model --genuine data\processed\genuine.parquet --negative data\processed\hardnegative.parquet --out-dir model_out
.\.venv\Scripts\python.exe -m ml_pipeline.plot_results --genuine data\processed\genuine.parquet --negative data\processed\hardnegative.parquet --model-dir model_out --out-dir reports\figures
```

## Backend Command

```powershell
.\.venv\Scripts\python.exe -m server.app
```

## Runtime Flow

```text
Browser events
  -> assets/js/collector.js
  -> assets/js/featureExtractor.js
  -> assets/js/mlAdapter.js
  -> Flask /predict
  -> model_out/model.pkl + scaler.pkl + calibration.json
  -> trust / prediction / confidence / risk
  -> TrustController
  -> PolicyEngine + banking views + Research Console
```

`assets/js/config.js` controls live vs simulation mode:

```js
SIMULATION: false
```

When Flask is unreachable or collector evidence stops, the adapter fails
closed by letting trust decay instead of freezing the last good value.

## Model Artifacts

`model_out/` must contain:

```text
model.pkl
scaler.pkl
calibration.json
stats.json
```

`server/app.py` loads `model_out/` by default. Override with:

```powershell
$env:MODEL_DIR = "path\to\model_out"
```

Trust smoothing can be tuned with:

```powershell
$env:TRUST_SMOOTHING_ALPHA = "0.4"
```

Lower values are smoother and slower to react. Higher values are snappier.
