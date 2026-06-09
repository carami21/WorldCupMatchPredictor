"""
Build Elo ratings for every team by replaying the full match history.

K-factor:
  - 60  for FIFA World Cup matches
  - 50  for continental championships (UEFA, CONMEBOL, etc.)
  - 40  for World Cup qualifiers
  - 30  for all other competitive matches
  - 20  for friendlies

All teams start at 1500. Ratings are stored as a dict {team: elo}.
"""
import math
import pandas as pd

BASE = 1500.0


def _k(tournament: str) -> int:
    t = tournament.lower()
    if "fifa world cup" in t and "qualification" not in t:
        return 60
    if any(x in t for x in ["euro", "copa america", "afcon", "asian cup", "gold cup"]):
        return 50
    if "qualification" in t or "qualifier" in t:
        return 40
    if "friendly" in t:
        return 20
    return 30


def _expected(ra: float, rb: float) -> float:
    return 1.0 / (1.0 + math.pow(10.0, (rb - ra) / 400.0))


def _score(home_goals: int, away_goals: int) -> tuple[float, float]:
    if home_goals > away_goals:
        return 1.0, 0.0
    if home_goals < away_goals:
        return 0.0, 1.0
    return 0.5, 0.5


def build_elo(df: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    """
    Replay matches in chronological order, compute Elo after each game.

    Returns:
        ratings  — final {team: elo} snapshot
        df_out   — original df with added columns:
                     home_elo_before, away_elo_before (rating at kick-off)
    """
    df = df.copy().sort_values("date").reset_index(drop=True)
    ratings: dict[str, float] = {}

    home_elos, away_elos = [], []

    for _, row in df.iterrows():
        home = row["home_team"]
        away = row["away_team"]

        ra = ratings.get(home, BASE)
        rb = ratings.get(away, BASE)
        home_elos.append(ra)
        away_elos.append(rb)

        sa, sb = _score(row["home_score"], row["away_score"])
        ea = _expected(ra, rb)
        k = _k(row["tournament"])

        ratings[home] = ra + k * (sa - ea)
        ratings[away] = rb + k * (sb - (1 - ea))

    df["home_elo_before"] = home_elos
    df["away_elo_before"] = away_elos
    return ratings, df
