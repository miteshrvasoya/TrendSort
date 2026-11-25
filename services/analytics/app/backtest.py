"""Category lag from back-test cases (measured lag preferred over analyst estimate)."""
from __future__ import annotations

import numpy as np

MIN_GROUP = 3


def category_lag(cases: list[dict], group: str, n_boot: int = 1000, seed: int = 7) -> dict:
    """Median India-lag in months with a bootstrap 80% interval. Falls back to all cases when the group is small."""
    grp = [c["lag_months"] for c in cases if c.get("group") == group and c.get("lag_months") is not None]
    basis = "group"
    vals = grp
    if len(grp) < MIN_GROUP:
        vals = [c["lag_months"] for c in cases if c.get("lag_months") is not None]
        basis = "global"
    if not vals:
        return {"lag_months": None, "ci_low": None, "ci_high": None, "n": 0, "basis": "none"}
    a = np.asarray(vals, dtype=float)
    rng = np.random.default_rng(seed)
    meds = np.median(rng.choice(a, size=(n_boot, len(a)), replace=True), axis=1)
    return {
        "lag_months": round(float(np.median(a)), 1), "ci_low": round(float(np.percentile(meds, 10)), 1),
        "ci_high": round(float(np.percentile(meds, 90)), 1), "n": len(a), "basis": basis,
    }
