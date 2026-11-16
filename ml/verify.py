"""Checks that a served model returns the same probabilities as the local pipeline.

Usage (from jobswipe/ml/):
    python verify.py http://127.0.0.1:8000          # local uvicorn
    python verify.py https://<you>--jobswipe-swipe-fit-fastapi-app.modal.run
"""
import json
import sys
import urllib.request

import joblib
import pandas as pd

from pipeline_def import INPUT_COLUMNS, JobFitFeatures  # noqa: F401

TOLERANCE = 1e-9

# Hand-written cases covering the edges, plus the bundle's real examples.
CASES = [
    {   # strong fit: same field, most skills, pay above floor
        "target_title": "Data Analyst", "candidate_skills": ["SQL", "Python", "Tableau"],
        "target_salary_min": 60000, "target_salary_max": 80000,
        "job_title": "Junior Data Analyst", "job_skills": ["sql", "python", "excel"],
        "is_remote": True, "job_salary_min": 65000, "job_salary_max": 85000,
        "embedding_similarity": 0.91,
    },
    {   # poor fit: different field, no shared skills, pay below floor
        "target_title": "Data Analyst", "candidate_skills": ["SQL", "Python"],
        "target_salary_min": 90000, "target_salary_max": None,
        "job_title": "Registered Nurse", "job_skills": ["patient care", "BLS"],
        "is_remote": False, "job_salary_min": 50000, "job_salary_max": None,
        "embedding_similarity": 0.80,
    },
    {   # sparse: no skills, no salary, no embedding (exercises the learned fill)
        "target_title": None, "candidate_skills": [],
        "target_salary_min": None, "target_salary_max": None,
        "job_title": "Software Engineer", "job_skills": [],
        "is_remote": False, "job_salary_min": None, "job_salary_max": None,
        "embedding_similarity": None,
    },
]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    base = sys.argv[1].rstrip("/")

    bundle = joblib.load("pipeline.joblib")
    cases = CASES + bundle["examples"]
    local = bundle["pipeline"].predict_proba(pd.DataFrame(cases, columns=INPUT_COLUMNS))[:, 1]

    req = urllib.request.Request(
        f"{base}/predict",
        data=json.dumps({"pairs": cases}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        remote = [p["swipe_right_probability"] for p in json.load(resp)["predictions"]]

    worst = 0.0
    print(f"{'case':>4}  {'local':>12}  {'served':>12}  {'abs diff':>10}")
    for i, (a, b) in enumerate(zip(local, remote)):
        diff = abs(a - b)
        worst = max(worst, diff)
        print(f"{i:>4}  {a:12.9f}  {b:12.9f}  {diff:10.2e}")

    ok = len(remote) == len(local) and worst <= TOLERANCE
    print(f"\n{'PASS' if ok else 'FAIL'}: {len(local)} cases, max abs diff {worst:.2e} (tolerance {TOLERANCE:g})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
