"""Trend maths: seasonality-adjusted momentum, sustainability, India adoption ratio, lead-lag.

Everything here is a pure function of weekly series. Scores that depend on the DB (breadth source
types, commercial proof, confidence) are assembled on the Node side.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from .leadlag import lead_lag

GROWTH_WINDOWS = [(1, 0.15), (4, 0.30), (13, 0.35), (52, 0.20)]  # weeks ~ 7/30/90/365 days
LOGISTIC_K = 2.2
GROWTH_FLOOR = 5.0
MIN_POINTS = 26
EARLY_RATIO = 0.02


def _fill(values: list[float | None]) -> np.ndarray | None:
    a = np.array([np.nan if v is None else float(v) for v in values], dtype=float)
    ok = ~np.isnan(a)
    if ok.sum() < MIN_POINTS:
        return None
    idx = np.arange(len(a))
    a[~ok] = np.interp(idx[~ok], idx[ok], a[ok])
    return a


def deseasonalise(a: np.ndarray) -> tuple[np.ndarray, bool]:
    """STL (period 52) trend + remainder when we have two full years; otherwise the raw series."""
    if len(a) >= 104:
        try:
            from statsmodels.tsa.seasonal import STL

            r = STL(a, period=52, robust=True).fit()
            return np.clip(r.trend + r.resid, 0, None), True
        except Exception:  # noqa: BLE001 - fall back to raw rather than fail the whole score
            pass
    return a, False


def smooth(a: np.ndarray, w: int = 4) -> np.ndarray:
    out = np.empty_like(a)
    for i in range(len(a)):
        out[i] = a[max(0, i - w + 1) : i + 1].mean()
    return out


def growth(a: np.ndarray, w: int) -> float | None:
    if len(a) < 2 * w:
        return None
    last, prior = a[-w:].mean(), a[-2 * w : -w].mean()
    g = (last - prior) / max(prior, GROWTH_FLOOR)
    return float(max(-1.0, min(3.0, g)))


def weighted_growth(a: np.ndarray) -> tuple[float | None, dict[str, float | None]]:
    parts: dict[str, float | None] = {}
    num = den = 0.0
    for w, wt in GROWTH_WINDOWS:
        g = growth(a, w)
        parts[f"w{w}"] = None if g is None else round(g, 4)
        if g is not None:
            num += g * wt
            den += wt
    return (num / den if den else None), parts


def momentum_from_growth(g: float) -> float:
    return round(100.0 / (1.0 + math.exp(-LOGISTIC_K * g)), 1)


def sustainability(raw: np.ndarray) -> dict[str, float | None]:
    """Fad vs steady rise. Higher = steadier. Needs >= 26 weeks."""
    a = raw[-104:]
    if len(a) < MIN_POINTS or a.sum() <= 0:
        return {"score": None, "spikiness": None, "persistence": None, "slope_stability": None}
    k = max(1, int(round(len(a) * 0.10)))
    share = float(np.sort(a)[-k:].sum() / a.sum())  # share of all interest in the top 10% of weeks
    spikiness = min(1.0, max(0.0, (share - 0.10) / 0.30))
    med = float(np.median(a))
    persistence = float((a[-12:] > med).mean())
    sm = smooth(a, 4)
    slopes = np.array([np.polyfit(np.arange(8), sm[i : i + 8], 1)[0] for i in range(0, len(sm) - 8)]) if len(sm) > 16 else np.array([0.0])
    level = max(float(sm.mean()), 1.0)
    slope_stability = 1.0 - min(1.0, float(slopes.std()) / (0.03 * level))
    score = 100 * (0.4 * (1 - spikiness) + 0.3 * persistence + 0.3 * slope_stability)
    r = lambda x: round(float(x), 3)  # noqa: E731
    return {"score": round(score, 1), "spikiness": r(spikiness), "persistence": r(persistence), "slope_stability": r(slope_stability)}


def analyze(weeks: list[str], series: dict[str, list[float | None]], comparable: bool, priorities: dict[str, int] | None = None) -> dict[str, Any]:
    priorities = priorities or {}
    notes: list[str] = []
    per: dict[str, dict[str, Any]] = {}
    smoothed: dict[str, np.ndarray] = {}
    smoothed_raw: dict[str, np.ndarray] = {}
    raws: dict[str, np.ndarray] = {}
    for cc, vals in series.items():
        a = _fill(vals)
        if a is None:
            notes.append(f"{cc}: fewer than {MIN_POINTS} weeks of data, skipped")
            continue
        adj, did = deseasonalise(a)
        if not did:
            notes.append(f"{cc}: under 104 weeks, seasonality not removed (lower confidence)")
        sm = smooth(adj)
        g, parts = weighted_growth(sm)
        raws[cc], smoothed[cc], smoothed_raw[cc] = a, sm, smooth(a)
        per[cc] = {
            "momentum": None if g is None else momentum_from_growth(g), "weighted_growth": None if g is None else round(g, 4),
            "growth": parts, "deseasonalised": did, "recent_level": round(float(sm[-4:].mean()), 2), "peak": round(float(sm.max()), 2), "weeks": int(len(a)),
        }

    foreign = {c: v for c, v in per.items() if c != "IN" and v["momentum"] is not None}
    out: dict[str, Any] = {"per_country": per, "notes": notes, "history_weeks": max((v["weeks"] for v in per.values()), default=0), "last_week": weeks[-1] if weeks else None}

    if foreign:
        wts = {c: (1.0 if priorities.get(c, 1) <= 1 else 0.7) for c in foreign}
        tot = sum(wts.values())
        mom = sum(foreign[c]["momentum"] * wts[c] for c in foreign) / tot
        signs = [1 if foreign[c]["weighted_growth"] > 0.02 else -1 if foreign[c]["weighted_growth"] < -0.02 else 0 for c in foreign]
        majority = max(set(signs), key=signs.count)
        agg_raw = np.mean([raws[c] for c in foreign], axis=0) if len({len(raws[c]) for c in foreign}) == 1 else raws[next(iter(foreign))]
        out["foreign"] = {
            "momentum": round(mom, 1), "countries_observed": len(foreign), "countries_confirming": sum(1 for c in foreign if foreign[c]["momentum"] >= 60),
            "agreement": round(signs.count(majority) / len(signs), 3), "sustainability": sustainability(agg_raw),
            "peak": round(max(float(smoothed[c].max()) for c in foreign), 2),
        }
    else:
        out["foreign"] = None
        notes.append("No foreign country with enough data; momentum unavailable")

    ind: dict[str, Any] = {"present": "IN" in per, "comparable": bool(comparable), "ratio": None, "growth13": None, "weeks_since_early": None}
    if "IN" in smoothed:
        s = smoothed["IN"]
        ind["growth13"] = per["IN"]["growth"].get("w13")
        peak = out["foreign"]["peak"] if out["foreign"] else None
        if comparable and peak and peak > 0:
            ind["ratio"] = round(float(s[-4:].mean() / peak), 4)
            above = s >= EARLY_RATIO * peak
            streak, first = 0, None
            for i, ok in enumerate(above):
                streak = streak + 1 if ok else 0
                if streak == 4:
                    first = i - 3
                    break
            ind["weeks_since_early"] = None if first is None else int(len(s) - 1 - first)
        elif not comparable:
            notes.append("India and foreign series are not jointly normalised: adoption stage withheld")
    out["india"] = ind

    ll = None
    if "IN" in smoothed and foreign:
        key = max(foreign, key=lambda c: foreign[c]["recent_level"])
        # Lead-lag uses smoothed RAW series: STL edge effects distort the cross-correlation. Strongly seasonal
        # products can therefore show a seasonal rather than adoption lag (see notes).
        n = min(len(smoothed_raw[key]), len(smoothed_raw["IN"]))
        ll = lead_lag(smoothed_raw[key][-n:].tolist(), smoothed_raw["IN"][-n:].tolist(), max_lag=min(104, n // 3))
        ll["months"] = round(ll["lag"] / 4.345, 1)
        ll["foreign_country"] = key
    out["lead_lag"] = ll
    return out
