"""Custom scikit-learn transformer for JobSwipe's swipe-fit model.

Turns a raw (candidate profile, job) pair into the fit signals the app already
shows users on the back of a job card (src/lib/matchReasons.ts), plus the
gte-small embedding similarity behind the "92% match" badge.
"""
import math
import re

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

# Raw columns the transformer expects (one row per profile/job pair).
INPUT_COLUMNS = [
    "target_title",
    "candidate_skills",
    "target_salary_min",
    "target_salary_max",
    "job_title",
    "job_skills",
    "is_remote",
    "job_salary_min",
    "job_salary_max",
    "embedding_similarity",
]

FEATURE_NAMES = [
    "skill_coverage",
    "skills_matched",
    "has_job_skills",
    "title_overlap",
    "log_salary_ratio",
    "salary_known",
    "embedding_similarity",
    "similarity_missing",
    "is_remote",
]

# Words that say little about what the job is ("Senior", "II", "and", ...).
_TITLE_STOPWORDS = {
    "a", "an", "and", "the", "of", "for", "to", "in", "at", "with", "or",
    "senior", "sr", "junior", "jr", "lead", "principal", "staff", "head",
    "i", "ii", "iii", "iv", "intern", "internship", "remote", "hybrid",
}


def _as_list(value):
    """Skills arrive as lists (API/JSON) or NaN/None (missing)."""
    if isinstance(value, (list, tuple, np.ndarray)):
        return list(value)
    return []


def _norm_skill(skill):
    return re.sub(r"\s+", " ", str(skill).strip().lower())


def _title_tokens(title):
    if not isinstance(title, str):
        return set()
    words = re.findall(r"[a-z0-9+#]+", title.lower())
    return {w for w in words if w not in _TITLE_STOPWORDS}


def _number(value):
    """Return a float, or None for missing values (None, NaN)."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


class JobFitFeatures(BaseEstimator, TransformerMixin):
    """Engineers job-fit features from a candidate profile and a job listing.

    Per (profile, job) row it produces:
        - skill_coverage: share of the job's required skills the candidate has
        - skills_matched: how many required skills the candidate has
        - has_job_skills: 1 if the job lists any skills (else coverage means nothing)
        - title_overlap: Jaccard overlap of target-title and job-title words
        - log_salary_ratio: log(job top pay / candidate's salary floor),
          clipped to [-1, 1]; 0 when either side is unknown
        - salary_known: 1 when both salaries are known
        - embedding_similarity: cosine similarity of the gte-small vectors,
          with missing values filled by the median learned in fit()
        - similarity_missing: 1 when the similarity had to be filled
        - is_remote: 1 for remote jobs

    fit() learns the fill value for missing embedding similarities, so a pair
    without vectors gets a typical score rather than a misleading 0.

    Two feature groups are off by default because the current swipe data can't
    support them (see ml/README.md):
        include_salary: log_salary_ratio and salary_known. Only 9 of 176
            exported swipes had both salaries, all left swipes, so the model
            learned "known salary = pass" regardless of whether the pay fit.
        include_missing_flag: similarity_missing. Swipes made before a profile
            was embedded were mostly test swipes (36% right vs. 12%), so the
            flag learned how the app was tested, not job fit.
    """

    def __init__(self, include_salary=False, include_missing_flag=False, salary_clip=1.0):
        self.include_salary = include_salary
        self.include_missing_flag = include_missing_flag
        self.salary_clip = salary_clip

    def _feature_mask(self):
        drop = set()
        if not self.include_salary:
            drop |= {"log_salary_ratio", "salary_known"}
        if not self.include_missing_flag:
            drop.add("similarity_missing")
        return [name not in drop for name in FEATURE_NAMES]

    def _frame(self, X):
        df = X if isinstance(X, pd.DataFrame) else pd.DataFrame(list(X))
        missing = [c for c in INPUT_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"Missing input columns: {missing}")
        return df

    def fit(self, X, y=None):
        df = self._frame(X)
        sims = pd.to_numeric(df["embedding_similarity"], errors="coerce").dropna()
        self.similarity_fill_ = float(sims.median()) if len(sims) else 0.0
        self.n_features_in_ = len(INPUT_COLUMNS)
        return self

    def transform(self, X):
        if not hasattr(self, "similarity_fill_"):
            raise RuntimeError("JobFitFeatures must be fitted before transform")
        df = self._frame(X)
        rows = []
        for r in df.itertuples(index=False):
            mine = {_norm_skill(s) for s in _as_list(r.candidate_skills)}
            required = {_norm_skill(s) for s in _as_list(r.job_skills)}
            matched = len(mine & required)
            coverage = matched / len(required) if required else 0.0

            t_cand, t_job = _title_tokens(r.target_title), _title_tokens(r.job_title)
            union = t_cand | t_job
            title_overlap = len(t_cand & t_job) / len(union) if union else 0.0

            # Same rule as the app's salaryFit(): job's top pay vs. candidate's floor.
            job_top = _number(r.job_salary_max) or _number(r.job_salary_min)
            floor = _number(r.target_salary_min) or _number(r.target_salary_max)
            if job_top and floor:
                ratio = math.log(job_top / floor)
                ratio = max(-self.salary_clip, min(self.salary_clip, ratio))
                salary_known = 1.0
            else:
                ratio, salary_known = 0.0, 0.0

            sim = _number(r.embedding_similarity)
            sim_missing = 1.0 if sim is None else 0.0
            if sim is None:
                sim = self.similarity_fill_

            rows.append([
                coverage,
                float(matched),
                1.0 if required else 0.0,
                title_overlap,
                ratio,
                salary_known,
                sim,
                sim_missing,
                1.0 if bool(r.is_remote) else 0.0,
            ])
        return np.array(rows, dtype=float)[:, self._feature_mask()]

    def get_feature_names_out(self, input_features=None):
        return np.array(FEATURE_NAMES)[self._feature_mask()]
