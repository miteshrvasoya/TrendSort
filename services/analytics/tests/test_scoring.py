import numpy as np
from fastapi.testclient import TestClient

from app.backtest import category_lag
from app.main import app
from app.scoring import analyze, momentum_from_growth, sustainability, growth, smooth

WEEKS = [f"w{i}" for i in range(156)]


def curve(kind: str, n=156, seed=0):
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, n)
    base = {"rising": 15 + 80 * x**2, "steady": np.full(n, 55.0), "spike": 10 + 90 * np.exp(-((x - 0.8) ** 2) / 0.004), "falling": 90 - 70 * x}[kind]
    return np.clip(base + rng.normal(0, 2, n), 0, 100)


def test_momentum_orders_rising_steady_falling():
    m = {k: analyze(WEEKS, {"US": curve(k).tolist()}, True)["foreign"]["momentum"] for k in ("rising", "steady", "falling")}
    assert m["rising"] > 62 > m["steady"] - 0.1 or m["rising"] > m["steady"]
    assert m["rising"] > m["steady"] > m["falling"]


def test_logistic_midpoint_and_bounds():
    assert momentum_from_growth(0) == 50.0
    assert momentum_from_growth(3) > 99
    assert momentum_from_growth(-1) <= 10


def test_growth_floor_prevents_blowup_from_tiny_base():
    a = np.array([0.0] * 10 + [3.0] * 10)
    assert growth(a, 5) <= 3.0


def test_sustainability_prefers_steady_over_spike():
    steady = sustainability(curve("steady"))["score"]
    spike = sustainability(curve("spike"))["score"]
    rising = sustainability(curve("rising"))["score"]
    assert steady > spike
    assert rising > spike
    assert sustainability(np.zeros(100))["score"] is None


def test_stl_removes_seasonality():
    n = 156
    t = np.arange(n)
    seasonal = 50 + 30 * np.sin(2 * np.pi * t / 52)
    r = analyze(WEEKS, {"US": seasonal.tolist()}, True)
    assert r["per_country"]["US"]["deseasonalised"]
    assert 35 < r["foreign"]["momentum"] < 65  # a pure annual cycle is not momentum


def test_short_series_flagged_and_skipped():
    r = analyze(WEEKS[:10], {"US": list(range(10))}, True)
    assert r["foreign"] is None
    assert any("skipped" in n for n in r["notes"])
    r2 = analyze(WEEKS[:60], {"US": curve("rising", 60).tolist()}, True)
    assert any("seasonality not removed" in n for n in r2["notes"])


def test_india_ratio_stage_inputs_and_early_signal():
    us = curve("rising")
    india = np.concatenate([np.full(100, 0.5), us[:56] * 0.2])  # appears late, ~20% of foreign
    r = analyze(WEEKS, {"US": us.tolist(), "IN": india.tolist()}, True)
    assert 0.05 < r["india"]["ratio"] < 0.5
    assert r["india"]["weeks_since_early"] is not None and r["india"]["weeks_since_early"] < 70


def test_non_comparable_withholds_ratio():
    us = curve("rising")
    r = analyze(WEEKS, {"US": us.tolist(), "IN": us.tolist()}, False)
    assert r["india"]["ratio"] is None
    assert any("not jointly normalised" in n for n in r["notes"])


def test_lead_lag_finds_india_delay():
    t = np.arange(156)
    us = 8 + 80 / (1 + np.exp(-(t - 70) / 10)) + np.random.default_rng(3).normal(0, 1.0, 156)  # S-curve adoption
    india = np.concatenate([np.full(20, us[0]), us[:-20]]) * 0.4
    r = analyze(WEEKS, {"US": us.tolist(), "IN": india.tolist()}, True)
    assert abs(r["lead_lag"]["lag"] - 20) <= 3


def test_breadth_inputs_countries_confirming():
    series = {c: curve("rising", seed=i).tolist() for i, c in enumerate(["US", "GB", "JP"])}
    series["KR"] = curve("falling").tolist()
    r = analyze(WEEKS, series, True)
    assert r["foreign"]["countries_observed"] == 4
    assert r["foreign"]["countries_confirming"] == 3
    assert 0.7 <= r["foreign"]["agreement"] <= 0.8


def test_category_lag_group_global_fallback_and_ci():
    cases = [{"group": "kitchen", "lag_months": v} for v in (20, 24, 26, 30)] + [{"group": "tech", "lag_months": 10}]
    k = category_lag(cases, "kitchen")
    assert k["basis"] == "group" and k["lag_months"] == 25 and k["ci_low"] <= 25 <= k["ci_high"]
    t = category_lag(cases, "tech")
    assert t["basis"] == "global" and t["n"] == 5
    assert category_lag([], "x")["lag_months"] is None
    assert category_lag(cases, "kitchen") == k  # deterministic


def test_api_endpoints():
    c = TestClient(app)
    body = {"weeks": WEEKS, "series": {"US": curve("rising").tolist(), "IN": (curve("rising") * 0.1).tolist()}, "comparable": True}
    j = c.post("/analyze", json=body).json()
    assert j["foreign"]["momentum"] > 50
    assert c.post("/backtest/category-lag", json={"group": "g", "cases": [{"group": "g", "lag_months": 12}]}).json()["basis"] in ("group", "global")
