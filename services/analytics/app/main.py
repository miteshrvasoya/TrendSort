"""TrendBridge analytics service. Phase 0: health + a lead-lag primitive that Phase 2 builds on."""
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .leadlag import lead_lag

app = FastAPI(title="TrendBridge Analytics", version="0.1.0")


class LeadLagRequest(BaseModel):
    foreign: list[float] = Field(min_length=8)
    india: list[float] = Field(min_length=8)
    max_lag: int = Field(default=52, ge=1, le=156)


@app.get("/health")
def health():
    return {"ok": True, "version": "0.1.0"}


@app.post("/lead-lag")
def lead_lag_endpoint(req: LeadLagRequest):
    return lead_lag(req.foreign, req.india, req.max_lag)
