from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router

app = FastAPI(title="어디까지왔니 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok"}
