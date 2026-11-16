"""Fits the swipe-fit pipeline on exported JobSwipe swipes and saves a joblib bundle.

Usage (from jobswipe/):
    npx supabase db query --remote --read-only -f ml/export_swipes.sql > ml/data/swipes_raw.json
    python ml/build_pipeline.py
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from pipeline_def import INPUT_COLUMNS, JobFitFeatures

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data" / "swipes_raw.json"
OUTPUT_PATH = HERE / "pipeline.joblib"
SEED = 42


def load_data():
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    rows = raw["rows"] if isinstance(raw, dict) else raw
    df = pd.DataFrame(rows)
    return df[INPUT_COLUMNS], df["swiped_right"].astype(int), df["candidate_key"]


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


def evaluate(X, y):
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    scores = cross_validate(
        build_pipeline(), X, y, cv=cv,
        scoring=["roc_auc", "balanced_accuracy", "f1"],
    )
    return {
        name.removeprefix("test_"): {
            "mean": round(float(np.mean(v)), 3),
            "std": round(float(np.std(v)), 3),
        }
        for name, v in scores.items()
        if name.startswith("test_")
    }


def main():
    X, y, users = load_data()
    print(f"{len(X)} swipes from {users.nunique()} users; {int(y.sum())} right, {int((1 - y).sum())} left")

    cv_metrics = evaluate(X, y)
    print("5-fold CV:", cv_metrics)

    pipeline = build_pipeline()
    pipeline.fit(X, y)

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
        "n_train": int(len(X)),
        "n_right": int(y.sum()),
        "n_users": int(users.nunique()),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "sklearn_version": sklearn.__version__,
    }

    joblib.dump({"pipeline": pipeline, "metadata": metadata, "examples": examples}, OUTPUT_PATH)
    print(f"Saved pipeline bundle to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
