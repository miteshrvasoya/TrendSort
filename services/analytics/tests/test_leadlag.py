import numpy as np
from fastapi.testclient import TestClient

from app.leadlag import lead_lag
from app.main import app


def test_recovers_known_lag():
    rng = np.random.default_rng(1)
    foreign = np.cumsum(rng.normal(size=120)) + 50
    india = np.concatenate([np.full(10, foreign[0]), foreign[:-10]]) * 0.5
    r = lead_lag(foreign.tolist(), india.tolist(), 30)
    assert r["lag"] == 10
    assert r["usable"]


def test_flat_series_not_usable():
    r = lead_lag([1.0] * 40, [1.0] * 40)
    assert not r["usable"]


def test_api():
    c = TestClient(app)
    assert c.get("/health").json()["ok"]
    rng = np.random.default_rng(2)
    x = np.cumsum(rng.normal(size=60)).tolist()
    assert c.post("/lead-lag", json={"foreign": x, "india": x}).json()["lag"] == 0
