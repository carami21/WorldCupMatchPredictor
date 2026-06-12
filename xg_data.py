"""
Fetch StatsBomb open event data for shot events.

Training data: multiple competitions for a general xG model.
Analysis data: World Cup 2022 for team/player heatmaps.
"""
import math
import warnings
from pathlib import Path

import pandas as pd

# Suppress the statsbombpy open-data auth warning (expected for free tier)
warnings.filterwarnings("ignore", message="credentials were not supplied")

CACHE_DIR = Path("data")
SHOTS_TRAINING_CACHE = CACHE_DIR / "shots_training.parquet"
SHOTS_WC2022_CACHE   = CACHE_DIR / "shots_wc2022.parquet"

# (competition_id, season_id, label)
# Using WC2022 only — 1,494 shots from the most relevant competition.
# Add more competitions with --refresh if you want to expand the training set.
TRAIN_COMPETITIONS = [
    (43, 106, "World Cup 2022"),
]

WC2022 = (43, 106, "World Cup 2022")

GOAL_X          = 120.0
GOAL_Y_CENTER   = 40.0
GOAL_POST_LEFT  = 36.0
GOAL_POST_RIGHT = 44.0


def _shot_geometry(x: float, y: float) -> tuple[float, float]:
    dx = GOAL_X - x
    distance = math.sqrt(dx ** 2 + (GOAL_Y_CENTER - y) ** 2)
    a1 = math.atan2(GOAL_POST_RIGHT - y, dx)
    a2 = math.atan2(GOAL_POST_LEFT  - y, dx)
    angle = abs(math.degrees(a1 - a2))
    return round(distance, 3), round(angle, 3)


def _defenders_in_cone(freeze_frame: list, x: float, y: float) -> int:
    count = 0
    for p in freeze_frame:
        if p.get("teammate", True):
            continue
        px, py = p["location"]
        if px > x and GOAL_POST_LEFT <= py <= GOAL_POST_RIGHT:
            count += 1
    return count


def _parse_shots(events: pd.DataFrame, competition: str = "") -> pd.DataFrame:
    """
    Extract one row per shot from a statsbombpy flattened events DataFrame.

    statsbombpy pre-flattens nested JSON: shot.outcome → shot_outcome (string),
    team → team (string), player → player (string), etc.
    """
    shots = events[events["type"] == "Shot"].copy()
    if shots.empty:
        return pd.DataFrame()

    records = []
    for _, row in shots.iterrows():
        try:
            loc = row.get("location") or []
            if len(loc) < 2:
                continue
            x, y = float(loc[0]), float(loc[1])

            distance, angle = _shot_geometry(x, y)
            freeze      = row.get("shot_freeze_frame") or []
            n_defenders = _defenders_in_cone(freeze, x, y)

            records.append({
                "x":             x,
                "y":             y,
                "distance":      distance,
                "angle":         angle,
                "body_part":     row.get("shot_body_part") or "Right Foot",
                "technique":     row.get("shot_technique") or "Normal",
                "shot_type":     row.get("shot_type") or "Open Play",
                "under_pressure": bool(row.get("under_pressure") or False),
                "play_pattern":  row.get("play_pattern") or "Regular Play",
                "n_defenders":   n_defenders,
                "is_goal":       int(row.get("shot_outcome") == "Goal"),
                "statsbomb_xg":  float(row.get("shot_statsbomb_xg") or 0.0),
                "player":        row.get("player") or "",
                "team":          row.get("team") or "",
                "minute":        int(row.get("minute") or 0),
                "match_id":      row.get("match_id"),
                "competition":   competition,
            })
        except Exception:
            continue

    return pd.DataFrame(records)


def _fetch_competition(competition_id: int, season_id: int, label: str) -> pd.DataFrame:
    from statsbombpy import sb

    print(f"  [{label}] fetching match list…", flush=True)
    matches = sb.matches(competition_id=competition_id, season_id=season_id)

    all_shots = []
    for mid in matches["match_id"]:
        try:
            events = sb.events(match_id=int(mid))
            events["match_id"] = int(mid)
            shots  = _parse_shots(events, competition=label)
            if not shots.empty:
                all_shots.append(shots)
        except Exception as e:
            print(f"    match {mid} skipped: {e}", flush=True)

    return pd.concat(all_shots, ignore_index=True) if all_shots else pd.DataFrame()


def _fetch_competition_cached(competition_id: int, season_id: int, label: str) -> pd.DataFrame:
    """Fetch and cache a single competition's shots. Skip fetch if already cached."""
    per_comp_cache = CACHE_DIR / f"shots_{competition_id}_{season_id}.parquet"
    if per_comp_cache.exists():
        print(f"  [{label}] using cache ({per_comp_cache.name})", flush=True)
        return pd.read_parquet(per_comp_cache)
    df = _fetch_competition(competition_id, season_id, label)
    if not df.empty:
        df.to_parquet(per_comp_cache, index=False)
        print(f"  {label}: {len(df):,} shots → cached", flush=True)
    return df


def load_training_shots(force_refresh: bool = False) -> pd.DataFrame:
    """Return shot dataset for xG model training (cached per-competition)."""
    if not force_refresh and SHOTS_TRAINING_CACHE.exists():
        return pd.read_parquet(SHOTS_TRAINING_CACHE)

    CACHE_DIR.mkdir(exist_ok=True)
    all_shots = []
    for comp_id, season_id, label in TRAIN_COMPETITIONS:
        try:
            df = _fetch_competition_cached(comp_id, season_id, label)
            if not df.empty:
                all_shots.append(df)
        except Exception as e:
            print(f"  {label} failed: {e}", flush=True)

    if not all_shots:
        raise RuntimeError("No training shots fetched — check network / statsbombpy install")

    df = pd.concat(all_shots, ignore_index=True)
    df.to_parquet(SHOTS_TRAINING_CACHE, index=False)
    print(f"Cached {len(df):,} training shots → {SHOTS_TRAINING_CACHE}")
    return df


def load_wc2022_shots(force_refresh: bool = False) -> pd.DataFrame:
    """Return World Cup 2022 shot data for team/player analysis (cached)."""
    if not force_refresh and SHOTS_WC2022_CACHE.exists():
        return pd.read_parquet(SHOTS_WC2022_CACHE)

    CACHE_DIR.mkdir(exist_ok=True)
    comp_id, season_id, label = WC2022
    # Re-use the per-competition cache if WC2022 was already fetched for training
    per_comp_cache = CACHE_DIR / f"shots_{comp_id}_{season_id}.parquet"
    if per_comp_cache.exists() and not force_refresh:
        df = pd.read_parquet(per_comp_cache)
    else:
        df = _fetch_competition(comp_id, season_id, label)
        if df.empty:
            raise RuntimeError("WC2022 shot data empty — check statsbombpy")
        df.to_parquet(per_comp_cache, index=False)

    df.to_parquet(SHOTS_WC2022_CACHE, index=False)
    print(f"Cached {len(df):,} WC2022 shots → {SHOTS_WC2022_CACHE}")
    return df
