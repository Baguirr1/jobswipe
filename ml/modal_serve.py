"""Modal deployment for the JobSwipe swipe-fit FastAPI service.

Deploy (from jobswipe/ml/):  modal deploy modal_serve.py
Library versions are pinned to the ones used to build pipeline.joblib, so the
deployed model computes exactly what the local one does.
"""
import modal

app = modal.App("jobswipe-swipe-fit")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "scikit-learn==1.9.0",
        "numpy==2.4.6",
        "pandas==3.0.5",
        "joblib==1.5.3",
        "fastapi==0.141.1",
        "pydantic",
    )
    .add_local_file("pipeline_def.py", "/root/pipeline_def.py")
    .add_local_file("pipeline.joblib", "/root/pipeline.joblib")
    .add_local_file("serve.py", "/root/serve.py")
)


@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    from serve import app as web_app

    return web_app
