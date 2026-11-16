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

## Results (176 swipes, 4 users, 32 right)

5-fold stratified CV: **ROC AUC 0.61 ± 0.06**, balanced accuracy 0.52. That's weak but honest for this little data. The largest coefficients are embedding similarity (+0.53) and skills matched (+0.26). Retrain as real users swipe.

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
