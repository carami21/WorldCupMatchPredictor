"""
Predict the outcome of any international match.

Usage:
    python predict.py "Brazil" "Argentina"
    python predict.py "Spain" "France" --home-ground
    python predict.py --list-teams          (show all available teams)
"""
import argparse
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from features import FEATURE_COLS, WINDOW

MODEL_PATH = Path("models/model.joblib")


def _team_current_stats(df: pd.DataFrame, team: str) -> dict:
    mask = (df["home_team"] == team) | (df["away_team"] == team)
    recent = df[mask].dropna(subset=["home_score", "away_score"]).tail(WINDOW)
    if len(recent) == 0:
        return {"form": 0.5, "goals_avg": 1.0, "conceded_avg": 1.0, "elo": 1500.0}

    wins, goals, conceded = 0.0, 0.0, 0.0
    last_elo = 1500.0
    for _, r in recent.iterrows():
        if r["home_team"] == team:
            goals += r["home_score"]
            conceded += r["away_score"]
            last_elo = r["home_elo_before"]
            if r["home_score"] > r["away_score"]:
                wins += 1
            elif r["home_score"] == r["away_score"]:
                wins += 0.5
        else:
            goals += r["away_score"]
            conceded += r["home_score"]
            last_elo = r["away_elo_before"]
            if r["away_score"] > r["home_score"]:
                wins += 1
            elif r["away_score"] == r["home_score"]:
                wins += 0.5

    n = len(recent)
    return {
        "form": wins / n,
        "goals_avg": goals / n,
        "conceded_avg": conceded / n,
        "elo": last_elo,
    }


def predict(home: str, away: str, neutral: bool = True) -> None:
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
        print(f"Team '{name}' not found in dataset.")
        if close:
            print(f"  Closest matches: {', '.join(close[:6])}")
        sys.exit(1)

    home = validate(home)
    away = validate(away)

    h = _team_current_stats(df_elo, home)
    a = _team_current_stats(df_elo, away)

    feat = pd.DataFrame([{
        "elo_diff": h["elo"] - a["elo"],
        "home_form": h["form"],
        "away_form": a["form"],
        "home_goals_avg": h["goals_avg"],
        "away_goals_avg": a["goals_avg"],
        "home_goals_conceded_avg": h["conceded_avg"],
        "away_goals_conceded_avg": a["conceded_avg"],
        "is_neutral": int(neutral),
    }], columns=FEATURE_COLS).fillna(0.0)

    probs = pipeline.predict_proba(feat)[0]
    away_win_p, draw_p, home_win_p = probs  # classes_ = [0, 1, 2]

    BAR = 28

    def bar(p: float) -> str:
        filled = round(p * BAR)
        return "█" * filled + "░" * (BAR - filled)

    venue = "Neutral venue" if neutral else f"{home} home"

    print()
    print("=" * 58)
    print(f"  {home}  vs  {away}")
    print(f"  {venue}")
    print("=" * 58)
    print(f"  Elo   → {home}: {h['elo']:.0f}  |  {away}: {a['elo']:.0f}")
    print(f"  Form  → {home}: {h['form']:.0%}  |  {away}: {a['form']:.0%}")
    print(f"  xG±   → {home}: {h['goals_avg']:.1f}–{h['conceded_avg']:.1f}"
          f"  |  {away}: {a['goals_avg']:.1f}–{a['conceded_avg']:.1f}")
    print("-" * 58)
    print(f"  {home:<20} {bar(home_win_p)}  {home_win_p:.1%}")
    print(f"  {'Draw':<20} {bar(draw_p)}  {draw_p:.1%}")
    print(f"  {away:<20} {bar(away_win_p)}  {away_win_p:.1%}")
    print("=" * 58)

    best = max(home_win_p, draw_p, away_win_p)
    if best == home_win_p:
        label = f"{home} win"
    elif best == draw_p:
        label = "Draw"
    else:
        label = f"{away} win"
    print(f"  Prediction: {label}  ({best:.1%} confidence)")
    print()


def list_teams(df_elo: pd.DataFrame) -> None:
    teams = sorted(set(df_elo["home_team"].unique()) | set(df_elo["away_team"].unique()))
    for t in teams:
        print(t)


def main():
    parser = argparse.ArgumentParser(description="World Cup match outcome predictor")
    parser.add_argument("home", nargs="?", help="First team (home/neutral)")
    parser.add_argument("away", nargs="?", help="Second team")
    parser.add_argument("--home-ground", action="store_true",
                        help="Treat first team as home side (default: neutral)")
    parser.add_argument("--list-teams", action="store_true",
                        help="Print all valid team names and exit")
    args = parser.parse_args()

    if args.list_teams:
        bundle = joblib.load(MODEL_PATH)
        list_teams(bundle["df_elo"])
        return

    if not args.home or not args.away:
        parser.print_help()
        sys.exit(1)

    predict(args.home, args.away, neutral=not args.home_ground)


if __name__ == "__main__":
    main()
