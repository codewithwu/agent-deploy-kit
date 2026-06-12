"""Weather Agent FastAPI 后端."""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Weather Agent API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
