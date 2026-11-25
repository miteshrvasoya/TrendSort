import numpy as np


def _diff_z(x: np.ndarray) -> np.ndarray:
    d = np.diff(x)
    sd = d.std()
    return (d - d.mean()) / sd if sd > 0 else d * 0


def lead_lag(foreign: list[float], india: list[float], max_lag: int = 52, smooth: int = 1) -> dict:
    """Cross-correlate differenced series. Positive lag = India follows foreign by `lag` periods.

    Returns the best lag, its correlation and an honest `usable` flag (corr >= 0.4).
    """
    fa, ia = np.asarray(foreign, dtype=float), np.asarray(india, dtype=float)
    if smooth > 1:
        k = np.ones(smooth) / smooth
        fa, ia = np.convolve(fa, k, mode="valid"), np.convolve(ia, k, mode="valid")
    f = _diff_z(fa)
    i = _diff_z(ia)
    n = min(len(f), len(i))
    f, i = f[:n], i[:n]
    best_lag, best_corr = 0, -2.0
    for lag in range(0, min(max_lag, n - 4) + 1):
        a, b = f[: n - lag], i[lag:]
        if a.std() == 0 or b.std() == 0:
            continue
        c = float(np.corrcoef(a, b)[0, 1])
        if c > best_corr:
            best_lag, best_corr = lag, c
    return {"lag": best_lag, "correlation": round(best_corr, 4) if best_corr > -2 else None,
            "usable": best_corr >= 0.4, "n": int(n)}
