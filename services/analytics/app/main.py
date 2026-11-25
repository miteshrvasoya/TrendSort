"""TrendBridge analytics service. Phase 0: health + a lead-lag primitive that Phase 2 builds on."""
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .backtest import category_lag
from .leadlag import lead_lag
from .scoring import analyze

app = FastAPI(title="TrendBridge Analytics", version="0.3.0")


class LeadLagRequest(BaseModel):
    foreign: list[float] = Field(min_length=8)
    india: list[float] = Field(min_length=8)
    max_lag: int = Field(default=52, ge=1, le=156)
    smooth: int = Field(default=1, ge=1, le=12)


@app.get("/health")
def health():
    return {"ok": True, "version": "0.4.0"}


@app.post("/lead-lag")
def lead_lag_endpoint(req: LeadLagRequest):
    return lead_lag(req.foreign, req.india, req.max_lag, req.smooth)


class AnalyzeRequest(BaseModel):
    weeks: list[str]
    series: dict[str, list[float | None]]
    comparable: bool = False
    priorities: dict[str, int] = {}


@app.post("/analyze")
def analyze_endpoint(req: AnalyzeRequest):
    return analyze(req.weeks, req.series, req.comparable, req.priorities)


class BacktestCase(BaseModel):
    group: str
    lag_months: float | None


class CategoryLagRequest(BaseModel):
    cases: list[BacktestCase]
    group: str


@app.post("/backtest/category-lag")
def category_lag_endpoint(req: CategoryLagRequest):
    return category_lag([c.model_dump() for c in req.cases], req.group)
