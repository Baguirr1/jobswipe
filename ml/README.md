# Swipe-fit model

A scikit-learn pipeline that predicts **P(candidate swipes right | profile, job)** from JobSwipe swipe data, served with FastAPI on Modal.  (`pipeline_def.py` → `build_pipeline.py` → `pipeline.joblib` → `serve.py` → `modal_serve.py`).

## Pipeline

`JobFitFeatures` → `StandardScaler` → `LogisticRegression(class_weight="balanced", C=0.3)`

`JobFitFeatures` (in `pipeline_def.py`) turns a raw profile/job pair into the fit signals the app shows on the back of a job card (`src/lib/matchReasons.ts`):

| Feature | Meaning |
|---|---|
| `skill_coverage` | share of the job's required skills the candidate has (case-insensitive) |
| `skills_matched` | how many required skills the candidate has |
| `has_job_skills` | whether the job lists skills at all |
| `title_overlap` | Jaccard overlap of target-title and job-title words, ignoring seniority words |
| `embedding_similarity` | cosine similarity of the gte-small vectors; missing values get the median learned in `fit()` |
| `is_remote` | remote job |

Two feature groups exist but are **off by default**, because the current data teaches them the wrong lesson:

- `include_salary=True` adds `log_salary_ratio` and `salary_known`. Only 9 of 176 swipes had both salaries, and all 9 were left swipes, so the model learned "known salary = pass" even when the pay fit.
- `include_missing_flag=True` adds `similarity_missing`. Swipes made before a profile was embedded were mostly test swipes (36% right vs. 12%). With this flag, CV AUC rose to 0.78, but the model scored an empty profile (0.78) above a strong fit (0.21). It had learned how the app was tested, not job fit.

## Evaluation and snapshots

The saved estimator wraps the full pipeline in sigmoid `CalibratedClassifierCV`.
Outer evaluation and inner calibration use candidate-disjoint `StratifiedGroupKFold`
indices, falling back to `GroupKFold` or fewer folds with warnings. Metadata reports
ROC AUC, balanced accuracy, F1, Brier score and log loss. Coefficients describe a
separate uncalibrated fit. Insufficient groups/labels make evaluation unavailable;
final training fails clearly if group-aware calibration is impossible.

When `created_at` is present, a separate earliest-80% / latest-20% holdout keeps
timestamp ties together. Candidates may appear on both sides; overlap is reported.
Missing timestamps make this test unavailable. These evaluations supersede the
previous row-stratified scores.

The export reads point-in-time snapshots from `swipe_events`, captured on
inserts and direction updates (`source = 'event'`). Swipes from before migration
`20261116000000` have no snapshot, so they are still exported by joining to the
*current* profile/job and flagged `source = 'legacy'`; their features may
postdate the label. Once enough events exist, train with
`python ml/build_pipeline.py --events-only`. Metadata records `rows_by_source`.
Undo/delete leaves events intact and creates no event. `model_version` is
initially null. Events cascade-delete with their profile/job (account deletion
removes training history). Clients can only SELECT their own events.

## Privacy

`export_swipes.sql` exports only fit-related fields (title, skills, salaries, similarity, label). No names, emails, bios or resume text are included, and candidate ids are replaced by an 8-character hash. `ml/data/` is gitignored.

## Run it

From `jobswipe/`:

```bash
npx supabase db query --remote --read-only -f ml/export_swipes.sql > ml/data/swipes_raw.json
cd ml
python build_pipeline.py                   # fit, cross-validate, save pipeline.joblib
python -m uvicorn serve:app --port 8000    # local API
python verify.py http://127.0.0.1:8000     # local pipeline vs. served API
modal deploy modal_serve.py                # deploy; prints the public URL
python verify.py https://<url>.modal.run   # local pipeline vs. deployed API
```

Endpoints: `GET /health`, `GET /info` (metadata plus a ready-to-send example body), `POST /predict` with `{"pairs": [{...}, ...]}` (1–100 pairs).

`modal_serve.py` pins scikit-learn, numpy, pandas and joblib to the versions that built the bundle, so the deployed model computes exactly the same numbers as the local one.

## Pay benchmarks

Jobs with no stated pay get an estimate from BLS OEWS wage data (migration
`20261116000007_stated_and_estimated_pay.sql`). `pay_benchmarks.py` pulls it
from the official BLS API: national 10th-90th percentile annual wages for one
representative occupation per job function, plus each state's all-occupation
median as a regional index (capped to 0.85-1.25 in SQL). It writes
`data/pay_benchmarks.json` and prints the SQL rows; refresh yearly when BLS
publishes a new May release, in a new migration.

    python ml/pay_benchmarks.py --year 2025

How a range is picked: internships use the hourly 10th-25th percentile (BLS
has no intern wages), part-time/temporary the 10th-50th hourly, contract the
25th-75th hourly; full-time uses the 50th-90th for senior titles, 10th-50th
for entry titles, otherwise the 25th-75th. Roles classified as "other" and
non-US locations get no estimate.
