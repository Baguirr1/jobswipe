"""FastAPI service exposing the JobSwipe swipe-fit pipeline."""
from pathlib import Path
from typing import Optional

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Import required so joblib can unpickle the custom transformer.
from pipeline_def import INPUT_COLUMNS, JobFitFeatures  # noqa: F401

ARTIFACT_PATH = Path(__file__).resolve().parent / "pipeline.joblib"

# Loaded exactly once, at import time.
try:
    _bundle = joblib.load(ARTIFACT_PATH)
    _load_error = None
except Exception as exc:  # noqa: BLE001 - want to capture any load failure
    _bundle = None
    _load_error = str(exc)

app = FastAPI(title="JobSwipe Swipe-Fit Service")

# Lets the Expo web build (Vercel, a different origin) call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Pair(BaseModel):
    """One candidate profile / job listing pair. Only fit-related fields: no PII."""

    target_title: Optional[str] = Field(None, max_length=200)
    candidate_skills: list[str] = Field(default_factory=list, max_length=100)
    target_salary_min: Optional[int] = Field(None, ge=0)
    target_salary_max: Optional[int] = Field(None, ge=0)
    job_title: str = Field(..., min_length=1, max_length=300)
    job_skills: list[str] = Field(default_factory=list, max_length=100)
    is_remote: bool = False
    job_salary_min: Optional[int] = Field(None, ge=0)
    job_salary_max: Optional[int] = Field(None, ge=0)
    embedding_similarity: Optional[float] = Field(None, ge=-1, le=1)


class PredictRequest(BaseModel):
    pairs: list[Pair] = Field(..., min_length=1, max_length=100)


def _get_bundle():
    if _bundle is None:
        raise HTTPException(status_code=503, detail=f"Model artifact unavailable: {_load_error}")
    return _bundle


@app.get("/health")
def health():
    return {"ok": _bundle is not None}


@app.get("/info")
def info():
    bundle = _get_bundle()
    return {"metadata": bundle["metadata"], "example_request": {"pairs": bundle["examples"]}}


@app.post("/predict")
def predict(request: PredictRequest):
    pipeline = _get_bundle()["pipeline"]
    frame = pd.DataFrame([p.model_dump() for p in request.pairs], columns=INPUT_COLUMNS)
    try:
        proba = pipeline.predict_proba(frame)[:, 1]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Prediction failed: {exc}")

    return {
        "predictions": [
            {"swipe_right_probability": float(p), "likely_right_swipe": bool(p >= 0.5)}
            for p in proba
        ]
    }
