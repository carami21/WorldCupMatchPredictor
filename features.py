"""
Feature engineering for the match outcome predictor.

Fast vectorized approach:
  1. Reshape each match into two rows (one per team)
  2. Sort by team + date
  3. Compute per-team rolling stats with pandas shift
  4. Pivot back and join to the original match df

Features (no data leakage — all computed at kick-off):
  elo_diff                  home Elo minus away Elo
  home_form                 home win rate in last 5 matches
  away_form                 away win rate in last 5 matches
  home_goals_avg            home team avg goals scored, last 5
  away_goals_avg            away team avg goals scored, last 5
  home_goals_conceded_avg   home team avg goals conceded, last 5
  away_goals_conceded_avg   away team avg goals conceded, last 5
  is_neutral                1 if neutral venue

Labels (home team POV):  2=home win, 1=draw, 0=away win
"""
import numpy as np
import pandas as pd

WINDOW = 5
FEATURE_COLS = [
    "elo_diff",
    "home_form",
    "away_form",
    "home_goals_avg",
    "away_goals_avg",
    "home_goals_conceded_avg",
    "away_goals_conceded_avg",
    "is_neutral",
]


def _build_team_history(df: pd.DataFrame) -> pd.DataFrame:
    """
    Reshape match df into one row per team per match.
    Columns: match_idx, date, team, goals_for, goals_against, win_points
    win_points: 1=win, 0.5=draw, 0=loss
    """
    home = df[["date", "home_team", "home_score", "away_score", "home_elo_before"]].copy()
    home.columns = ["date", "team", "goals_for", "goals_against", "elo"]
    home["match_idx"] = df.index

    away = df[["date", "away_team", "away_score", "home_score", "away_elo_before"]].copy()
    away.columns = ["date", "team", "goals_for", "goals_against", "elo"]
    away["match_idx"] = df.index

    def win_pts(row):
        if row["goals_for"] > row["goals_against"]:
            return 1.0
        if row["goals_for"] == row["goals_against"]:
            return 0.5
        return 0.0

    combined = pd.concat([home, away], ignore_index=True)
    combined["win_points"] = combined.apply(win_pts, axis=1)
    combined = combined.sort_values(["team", "date", "match_idx"]).reset_index(drop=True)
    return combined


def _rolling_team_stats(hist: pd.DataFrame, window: int = WINDOW) -> pd.DataFrame:
    """
    For each team's match, compute rolling stats over the PREVIOUS `window` games.
    Returns a df indexed by (team, match_idx).
    """
    grp = hist.groupby("team", sort=False)

    form = grp["win_points"].transform(
        lambda s: s.shift(1).rolling(window, min_periods=1).mean()
    )
    goals_avg = grp["goals_for"].transform(
        lambda s: s.shift(1).rolling(window, min_periods=1).mean()
    )
    conceded_avg = grp["goals_against"].transform(
        lambda s: s.shift(1).rolling(window, min_periods=1).mean()
    )

    result = hist[["team", "match_idx"]].copy()
    result["form"] = form.fillna(0.5)
    result["goals_avg"] = goals_avg.fillna(1.0)
    result["conceded_avg"] = conceded_avg.fillna(1.0)
    return result


def build_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    df = df.copy().reset_index(drop=True)

    hist = _build_team_history(df)
    stats = _rolling_team_stats(hist)

    # Split back into home and away perspectives
    home_stats = stats[stats["team"].isin(df["home_team"].values)].copy()
    # We need to match by match_idx, so let's pivot on that
    # stats has one row per (team, match) — separate home from away by merging

    home_lookup = (
        stats.merge(
            df[["home_team"]].reset_index().rename(columns={"index": "match_idx"}),
            on="match_idx",
        )
        .query("team == home_team")
        .set_index("match_idx")[["form", "goals_avg", "conceded_avg"]]
        .rename(columns=lambda c: f"home_{c}")
    )

    away_lookup = (
        stats.merge(
            df[["away_team"]].reset_index().rename(columns={"index": "match_idx"}),
            on="match_idx",
        )
        .query("team == away_team")
        .set_index("match_idx")[["form", "goals_avg", "conceded_avg"]]
        .rename(columns=lambda c: f"away_{c}")
    )

    X = pd.DataFrame(index=df.index)
    X["elo_diff"] = df["home_elo_before"] - df["away_elo_before"]
    X["home_form"] = home_lookup["home_form"]
    X["away_form"] = away_lookup["away_form"]
    X["home_goals_avg"] = home_lookup["home_goals_avg"]
    X["away_goals_avg"] = away_lookup["away_goals_avg"]
    X["home_goals_conceded_avg"] = home_lookup["home_conceded_avg"]
    X["away_goals_conceded_avg"] = away_lookup["away_conceded_avg"]
    X["is_neutral"] = df.get("neutral", pd.Series(False, index=df.index)).astype(int)

    X = X[FEATURE_COLS].fillna(X.median())

    y = df.apply(
        lambda r: 2 if r["home_score"] > r["away_score"]
        else (1 if r["home_score"] == r["away_score"] else 0),
        axis=1,
    )
    return X, y
