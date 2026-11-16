"""Fits the swipe-fit pipeline on exported JobSwipe swipes and saves a joblib bundle.

Usage (from jobswipe/):
    npx supabase db query --remote --read-only -f ml/export_swipes.sql > ml/data/swipes_raw.json
    python ml/build_pipeline.py
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, brier_score_loss, f1_score, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold, StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from pipeline_def import INPUT_COLUMNS, JobFitFeatures

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data" / "swipes_raw.json"
OUTPUT_PATH = HERE / "pipeline.joblib"
SEED = 42


def load_data(events_only=False):
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    rows = raw["rows"] if isinstance(raw, dict) else raw
    df = pd.DataFrame(rows)
    # Older exports have no source column: every row is a legacy join.
    if "source" not in df:
        df["source"] = "legacy"
    print("Rows by source:", df["source"].value_counts().to_dict())
    if events_only:
        df = df[df["source"] == "event"].reset_index(drop=True)
        if df.empty:
            raise SystemExit("No point-in-time events exported yet; rerun without --events-only.")
    sources = df["source"].value_counts().to_dict()
    return df[INPUT_COLUMNS], df["swiped_right"].astype(int), df["candidate_key"], df.get("created_at"), sources


def build_pipeline():
    return Pipeline(
        steps=[
            # Salary and missing-similarity features stay off; see JobFitFeatures.
            ("job_fit", JobFitFeatures(include_salary=False, include_missing_flag=False)),
            ("scale", StandardScaler()),
            # Right swipes are rare (~1 in 5), so weight the classes evenly.
            # C=0.3: mild extra regularization for a 176-row dataset.
            ("classifier", LogisticRegression(class_weight="balanced", C=0.3, max_iter=1000)),
        ]
    )


def grouped_splits(X, y, users):
    """Require both labels on each side, without ever splitting a candidate."""
    count = min(5, users.nunique(), int(y.value_counts().min()))
    if count < 5:
        print(f"WARNING: using at most {count} group folds ({users.nunique()} users).")
    if y.nunique() != 2 or count < 2:
        raise ValueError("Need at least two users and enough labels for group-aware calibration.")
    for n in range(count, 1, -1):
        for cv in (StratifiedGroupKFold(n_splits=n, shuffle=True, random_state=SEED),
                   GroupKFold(n_splits=n)):
            splits = list(cv.split(X, y, groups=users))
            if all(y.iloc[a].nunique() == 2 and y.iloc[b].nunique() == 2 for a, b in splits):
                if n != 5 or isinstance(cv, GroupKFold):
                    print(f"WARNING: selected {type(cv).__name__} with {n} folds.")
                return splits
    raise ValueError("No group-disjoint folds with both labels; collect more candidates/labels.")


def fit_calibrated(X, y, users):
    # Explicit indices keep calibration group-aware on sklearn versions that do
    # not forward groups through CalibratedClassifierCV.fit().
    model = CalibratedClassifierCV(build_pipeline(), method="sigmoid",
                                   cv=grouped_splits(X, y, users), ensemble=False)
    return model.fit(X, y)


def metrics(y, probabilities):
    predictions = probabilities >= 0.5
    both = y.nunique() == 2
    return {
        "roc_auc": float(roc_auc_score(y, probabilities)) if both else None,
        "balanced_accuracy": float(balanced_accuracy_score(y, predictions)) if both else None,
        "f1": float(f1_score(y, predictions, zero_division=0)),
        "brier_score": float(brier_score_loss(y, probabilities)),
        "log_loss": float(log_loss(y, probabilities, labels=[0, 1])),
    }


def evaluate(X, y, users):
    results = []
    try:
        splits = grouped_splits(X, y, users)
    except ValueError as exc:
        print(f"WARNING: CV unavailable: {exc}")
        return {"status": "unavailable", "reason": str(exc)}
    for train, test in splits:
        try:
            model = fit_calibrated(X.iloc[train], y.iloc[train], users.iloc[train])
        except ValueError as exc:
            print(f"WARNING: nested CV unavailable: {exc}")
            return {"status": "unavailable", "reason": str(exc)}
        results.append(metrics(y.iloc[test], model.predict_proba(X.iloc[test])[:, 1]))
    return {"n_splits": len(results), **{
        name: {"mean": round(float(np.mean([r[name] for r in results])), 3),
               "std": round(float(np.std([r[name] for r in results])), 3)}
        for name in results[0]
    }}


def evaluate_time_holdout(X, y, users, created_at):
    if created_at is None:
        return {"status": "unavailable", "reason": "created_at absent"}
    times = pd.to_datetime(created_at, utc=True, errors="coerce")
    if times.isna().any() or len(X) < 2:
        return {"status": "unavailable", "reason": "missing/invalid timestamps or too few rows"}
    order = np.argsort(times.to_numpy(), kind="stable")
    cutoff = times.iloc[order[min(len(X) - 1, max(1, int(len(X) * 0.8)))]]
    # Keep equal timestamps together: no training event can postdate a test event.
    train = np.flatnonzero((times < cutoff).to_numpy())
    test = np.flatnonzero((times >= cutoff).to_numpy())
    if not len(train) or not len(test):
        return {"status": "unavailable", "reason": "no distinct timestamp boundary"}
    try:
        model = fit_calibrated(X.iloc[train], y.iloc[train], users.iloc[train])
    except ValueError as exc:
        return {"status": "unavailable", "reason": str(exc)}
    return {"n_train": len(train), "n_test": len(test), "cutoff": cutoff.isoformat(),
            "candidate_overlap": int(len(set(users.iloc[train]) & set(users.iloc[test]))),
            "metrics": metrics(y.iloc[test], model.predict_proba(X.iloc[test])[:, 1])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH,
                        help="Bundle destination (use a temporary path for local verification).")
    parser.add_argument("--events-only", action="store_true",
                        help="Train only on point-in-time swipe_events rows (drop legacy joins).")
    args = parser.parse_args()
    X, y, users, created_at, sources = load_data(events_only=args.events_only)
    print(f"{len(X)} swipes from {users.nunique()} users; {int(y.sum())} right, {int((1 - y).sum())} left")

    cv_metrics = evaluate(X, y, users)
    print("Candidate-group CV (nested calibration):", cv_metrics)
    time_holdout = evaluate_time_holdout(X, y, users, created_at)
    print("Time holdout:", time_holdout)

    calibrated = fit_calibrated(X, y, users)
    pipeline = build_pipeline().fit(X, y)  # descriptive coefficients only

    feature_names = pipeline.named_steps["job_fit"].get_feature_names_out().tolist()
    coefs = pipeline.named_steps["classifier"].coef_[0]
    coefficients = {n: round(float(c), 4) for n, c in zip(feature_names, coefs)}
    print("Coefficients (standardized):", coefficients)

    # A couple of training rows, so /info shows a ready-made /predict body.
    # to_json turns NaN into null, so the examples are valid request bodies.
    picks = [int(np.argmax(y.values)), int(np.argmin(y.values))]  # one right, one left
    examples = json.loads(X.iloc[picks].to_json(orient="records"))

    metadata = {
        "model": "swipe-fit: P(candidate swipes right | profile, job)",
        "steps": [name for name, _ in pipeline.steps],
        "input_columns": INPUT_COLUMNS,
        "feature_names": feature_names,
        "similarity_fill": pipeline.named_steps["job_fit"].similarity_fill_,
        "coefficients": coefficients,
        "cv_metrics": cv_metrics,
        "time_holdout": time_holdout,
        "calibrated": True,
        "calibration_method": "sigmoid",
        "rows_by_source": {k: int(v) for k, v in sources.items()},
        "n_train": int(len(X)),
        "n_right": int(y.sum()),
        "n_users": int(users.nunique()),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "sklearn_version": sklearn.__version__,
    }

    joblib.dump({"pipeline": calibrated, "metadata": metadata, "examples": examples}, args.output)
    print(f"Saved pipeline bundle to {args.output}")


if __name__ == "__main__":
    main()
