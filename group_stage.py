"""
Simulate a World Cup group stage for any 4 teams.

Usage:
    python group_stage.py "Brazil" "Argentina" "Mexico" "United States"

Runs all 6 round-robin matchups using the trained model.
Outputs:
  - Per-match probability breakdown
  - Expected points table (probability-weighted)
  - Monte Carlo standings (10,000 simulations) with qualification %
"""
import argparse
import sys
from itertools import combinations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from predict import _team_current_stats
from features import FEATURE_COLS

MODEL_PATH = Path("models/model.joblib")
SIMS = 10_000


def _predict_match(pipeline, home_stats: dict, away_stats: dict) -> np.ndarray:
    """Return [away_win_p, draw_p, home_win_p] probabilities."""
    feat = pd.DataFrame([{
        "elo_diff": home_stats["elo"] - away_stats["elo"],
        "home_form": home_stats["form"],
        "away_form": away_stats["form"],
        "home_goals_avg": home_stats["goals_avg"],
        "away_goals_avg": away_stats["goals_avg"],
        "home_goals_conceded_avg": home_stats["conceded_avg"],
        "away_goals_conceded_avg": away_stats["conceded_avg"],
        "is_neutral": 1,
    }], columns=FEATURE_COLS).fillna(0.0)
    return pipeline.predict_proba(feat)[0]  # [away_win, draw, home_win]


def _sample_score(goals_avg: float, conceded_avg: float) -> int:
    """Sample goals scored using Poisson with lambda = mean of attack & opponent defense."""
    lam = max(0.3, (goals_avg + conceded_avg) / 2)
    return int(np.random.poisson(lam))


def _simulate_group(teams: list[str], stats: dict, pipeline, n: int = SIMS) -> dict:
    """
    Monte Carlo: run n simulations of the full group stage.
    Returns {team: {"sim_pts": [], "sim_gd": [], "sim_gf": [], "first": int, "second": int}}
    """
    matchups = list(combinations(range(len(teams)), 2))
    match_probs = {}
    for i, j in matchups:
        probs = _predict_match(pipeline, stats[teams[i]], stats[teams[j]])
        match_probs[(i, j)] = probs  # [away_win, draw, home_win] → team j win, draw, team i win

    first_count = {t: 0 for t in teams}
    second_count = {t: 0 for t in teams}

    for _ in range(n):
        pts = {t: 0 for t in teams}
        gd = {t: 0 for t in teams}
        gf = {t: 0 for t in teams}

        for i, j in matchups:
            ti, tj = teams[i], teams[j]
            away_p, draw_p, home_p = match_probs[(i, j)]
            outcome = np.random.choice([2, 1, 0], p=[home_p, draw_p, away_p])

            # Sample goals for GD tiebreaker
            gi = _sample_score(stats[ti]["goals_avg"], stats[tj]["conceded_avg"])
            gj = _sample_score(stats[tj]["goals_avg"], stats[ti]["conceded_avg"])

            if outcome == 2:      # team i wins
                pts[ti] += 3
                gi = max(gi, gj + 1)
            elif outcome == 0:    # team j wins
                pts[tj] += 3
                gj = max(gj, gi + 1)
            else:                 # draw
                pts[ti] += 1
                pts[tj] += 1
                gi = gj = max(gi, gj)  # equalize for draw

            gd[ti] += gi - gj
            gd[tj] += gj - gi
            gf[ti] += gi
            gf[tj] += gj

        # Rank: pts → gd → gf
        ranked = sorted(
            teams,
            key=lambda t: (pts[t], gd[t], gf[t]),
            reverse=True,
        )
        first_count[ranked[0]] += 1
        second_count[ranked[1]] += 1

    return first_count, second_count


def _expected_table(teams: list[str], stats: dict, pipeline) -> pd.DataFrame:
    """
    Compute expected points table using raw probabilities (no simulation).
    Home win prob → 3 pts for team i, Away win → 3 pts for team j, Draw → 1 each.
    """
    exp_pts = {t: 0.0 for t in teams}
    matchups = list(combinations(range(len(teams)), 2))
    for i, j in matchups:
        ti, tj = teams[i], teams[j]
        away_p, draw_p, home_p = _predict_match(pipeline, stats[ti], stats[tj])
        exp_pts[ti] += home_p * 3 + draw_p * 1
        exp_pts[tj] += away_p * 3 + draw_p * 1

    rows = [{"Team": t, "xPts": round(exp_pts[t], 2), "Elo": int(stats[t]["elo"])} for t in teams]
    df = pd.DataFrame(rows).sort_values("xPts", ascending=False).reset_index(drop=True)
    df.index += 1
    return df


def _print_match_grid(teams: list[str], stats: dict, pipeline) -> None:
    matchups = list(combinations(range(len(teams)), 2))
    print("\n  Match Predictions\n" + "─" * 54)
    for i, j in matchups:
        ti, tj = teams[i], teams[j]
        away_p, draw_p, home_p = _predict_match(pipeline, stats[ti], stats[tj])
        print(f"  {ti:<18} vs  {tj:<18}")
        print(f"    {ti} win: {home_p:.0%}  |  Draw: {draw_p:.0%}  |  {tj} win: {away_p:.0%}")
    print()


def simulate(teams: list[str]) -> None:
    if not MODEL_PATH.exists():
        print("Model not found. Run: python train.py")
        sys.exit(1)

    bundle = joblib.load(MODEL_PATH)
    pipeline = bundle["pipeline"]
    df_elo = bundle["df_elo"]

    all_teams = sorted(set(df_elo["home_team"].unique()) | set(df_elo["away_team"].unique()))

    def validate(name: str) -> str:
        if name in all_teams:
            return name
        close = [t for t in all_teams if name.lower() in t.lower()]
        if len(close) == 1:
            return close[0]
        print(f"Team '{name}' not found.")
        if close:
            print(f"  Did you mean: {', '.join(close[:5])}")
        sys.exit(1)

    teams = [validate(t) for t in teams]
    stats = {t: _team_current_stats(df_elo, t) for t in teams}

    print()
    print("=" * 54)
    print(f"  GROUP STAGE SIMULATOR — FIFA World Cup 2026")
    print("=" * 54)
    for t in teams:
        s = stats[t]
        print(f"  {t:<22} Elo {s['elo']:.0f}  Form {s['form']:.0%}")
    print()

    _print_match_grid(teams, stats, pipeline)

    # Expected points table
    xpts_df = _expected_table(teams, stats, pipeline)
    print("  Expected Points Table")
    print("─" * 38)
    print(f"  {'#':<4} {'Team':<22} {'Elo':>5}  {'xPts':>5}")
    print("─" * 38)
    for pos, row in xpts_df.iterrows():
        arrow = "  ✓ advance" if pos <= 2 else ""
        print(f"  {pos:<4} {row['Team']:<22} {row['Elo']:>5}  {row['xPts']:>5}{arrow}")
    print()

    # Monte Carlo
    print(f"  Monte Carlo Results  ({SIMS:,} simulations)")
    print("─" * 48)
    print(f"  {'Team':<22} {'1st':>6}  {'2nd':>6}  {'Qualify':>8}")
    print("─" * 48)
    first_count, second_count = _simulate_group(teams, stats, pipeline)
    mc_rows = [
        {
            "team": t,
            "first": first_count[t] / SIMS,
            "second": second_count[t] / SIMS,
            "qualify": (first_count[t] + second_count[t]) / SIMS,
        }
        for t in teams
    ]
    mc_rows.sort(key=lambda r: r["qualify"], reverse=True)
    for r in mc_rows:
        bar_len = round(r["qualify"] * 20)
        bar = "█" * bar_len + "░" * (20 - bar_len)
        print(f"  {r['team']:<22} {r['first']:>5.0%}  {r['second']:>5.0%}  {bar}  {r['qualify']:>5.0%}")
    print()


def main():
    parser = argparse.ArgumentParser(description="World Cup group stage simulator")
    parser.add_argument("teams", nargs=4, metavar="TEAM",
                        help="Exactly 4 team names (use quotes for multi-word names)")
    args = parser.parse_args()
    simulate(args.teams)


if __name__ == "__main__":
    main()
