"""
Flask API for the World Cup Match Outcome Predictor.

Endpoints:
  GET  /api/teams           — list of all valid team names
  POST /api/predict         — predict a single match outcome
  POST /api/group           — simulate a full group stage

Run:
  python app.py             (dev, port 5000)
  flask run --port 5000
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from itertools import combinations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sys

from features import FEATURE_COLS
from predict import _team_current_stats
from group_stage import _predict_match, _simulate_group, SIMS

MODEL_PATH = Path("models/model.joblib")

app = Flask(__name__)
CORS(app)

# ── Load model once at startup ────────────────────────────────────────────────
if not MODEL_PATH.exists():
    print("ERROR: models/model.joblib not found. Run: python train.py")
    sys.exit(1)

bundle = joblib.load(MODEL_PATH)
pipeline = bundle["pipeline"]
df_elo = bundle["df_elo"]
ALL_TEAMS = sorted(
    set(df_elo["home_team"].unique()) | set(df_elo["away_team"].unique())
)


# ── Helpers ───────────────────────────────────────────────────────────────────
def resolve_team(name: str) -> str | None:
    """Return exact team name or None if not found."""
    if name in ALL_TEAMS:
        return name
    # Case-insensitive fallback
    lower = name.lower()
    matches = [t for t in ALL_TEAMS if t.lower() == lower]
    return matches[0] if matches else None


def team_not_found(name: str) -> dict:
    close = [t for t in ALL_TEAMS if name.lower() in t.lower()][:5]
    return {"error": f"Team '{name}' not found.", "suggestions": close}


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
def index():
    return jsonify({
        "name": "World Cup Match Outcome Predictor API",
        "endpoints": {
            "GET  /health": "Health check",
            "GET  /api/teams": "List all valid team names",
            "POST /api/predict": "Predict a single match outcome",
            "POST /api/group": "Simulate a full group stage (4 teams)",
        }
    })


@app.get("/api/teams")
def get_teams():
    """Return all valid team names."""
    return jsonify({"teams": ALL_TEAMS, "count": len(ALL_TEAMS)})


@app.post("/api/predict")
def predict():
    """
    Predict the outcome of a single match.

    Body: { "home": "Brazil", "away": "Argentina", "neutral": true }

    Response:
    {
      "home": "Brazil",
      "away": "Argentina",
      "neutral": true,
      "home_elo": 1931,
      "away_elo": 2037,
      "home_form": 0.70,
      "away_form": 1.00,
      "home_goals_avg": 2.6,
      "away_goals_avg": 3.4,
      "home_goals_conceded_avg": 1.4,
      "away_goals_conceded_avg": 0.2,
      "probabilities": {
        "home_win": 0.194,
        "draw": 0.245,
        "away_win": 0.561
      },
      "prediction": "away_win",
      "prediction_label": "Argentina win"
    }
    """
    body = request.get_json(silent=True) or {}
    home_raw = body.get("home", "").strip()
    away_raw = body.get("away", "").strip()
    neutral = bool(body.get("neutral", True))

    if not home_raw or not away_raw:
        return jsonify({"error": "Both 'home' and 'away' fields are required."}), 400

    home = resolve_team(home_raw)
    if not home:
        return jsonify(team_not_found(home_raw)), 404

    away = resolve_team(away_raw)
    if not away:
        return jsonify(team_not_found(away_raw)), 404

    if home == away:
        return jsonify({"error": "Home and away teams must be different."}), 400

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

    away_win_p, draw_p, home_win_p = pipeline.predict_proba(feat)[0]

    best = max(home_win_p, draw_p, away_win_p)
    if best == home_win_p:
        prediction, label = "home_win", f"{home} win"
    elif best == draw_p:
        prediction, label = "draw", "Draw"
    else:
        prediction, label = "away_win", f"{away} win"

    return jsonify({
        "home": home,
        "away": away,
        "neutral": neutral,
        "home_elo": round(h["elo"]),
        "away_elo": round(a["elo"]),
        "home_form": round(h["form"], 3),
        "away_form": round(a["form"], 3),
        "home_goals_avg": round(h["goals_avg"], 2),
        "away_goals_avg": round(a["goals_avg"], 2),
        "home_goals_conceded_avg": round(h["conceded_avg"], 2),
        "away_goals_conceded_avg": round(a["conceded_avg"], 2),
        "probabilities": {
            "home_win": round(float(home_win_p), 4),
            "draw": round(float(draw_p), 4),
            "away_win": round(float(away_win_p), 4),
        },
        "prediction": prediction,
        "prediction_label": label,
    })


@app.post("/api/group")
def group():
    """
    Simulate a full group stage for exactly 4 teams.

    Body: { "teams": ["Brazil", "Argentina", "Mexico", "United States"] }

    Response:
    {
      "teams": ["Argentina", "Brazil", "Mexico", "United States"],
      "matches": [
        {
          "home": "Brazil", "away": "Argentina",
          "home_win_p": 0.194, "draw_p": 0.245, "away_win_p": 0.561,
          "prediction": "away_win", "prediction_label": "Argentina win"
        }, ...
      ],
      "expected_table": [
        { "rank": 1, "team": "Argentina", "xpts": 6.13, "elo": 2037, "advances": true },
        ...
      ],
      "monte_carlo": [
        { "team": "Argentina", "first_pct": 0.60, "second_pct": 0.24, "qualify_pct": 0.84 },
        ...
      ]
    }
    """
    body = request.get_json(silent=True) or {}
    raw_teams = body.get("teams", [])

    if not isinstance(raw_teams, list) or len(raw_teams) != 4:
        return jsonify({"error": "Provide exactly 4 teams as a list."}), 400

    teams = []
    for t in raw_teams:
        resolved = resolve_team(str(t).strip())
        if not resolved:
            return jsonify(team_not_found(str(t))), 404
        teams.append(resolved)

    if len(set(teams)) != 4:
        return jsonify({"error": "All 4 teams must be different."}), 400

    stats = {t: _team_current_stats(df_elo, t) for t in teams}

    # Build match list
    matchups = list(combinations(range(4), 2))
    matches = []
    exp_pts = {t: 0.0 for t in teams}

    for i, j in matchups:
        ti, tj = teams[i], teams[j]
        away_p, draw_p, home_p = _predict_match(pipeline, stats[ti], stats[tj])
        exp_pts[ti] += home_p * 3 + draw_p * 1
        exp_pts[tj] += away_p * 3 + draw_p * 1

        best = max(home_p, draw_p, away_p)
        if best == home_p:
            pred, label = "home_win", f"{ti} win"
        elif best == draw_p:
            pred, label = "draw", "Draw"
        else:
            pred, label = "away_win", f"{tj} win"

        matches.append({
            "home": ti,
            "away": tj,
            "home_win_p": round(float(home_p), 4),
            "draw_p": round(float(draw_p), 4),
            "away_win_p": round(float(away_p), 4),
            "prediction": pred,
            "prediction_label": label,
        })

    # Expected points table
    sorted_teams = sorted(teams, key=lambda t: exp_pts[t], reverse=True)
    expected_table = [
        {
            "rank": rank + 1,
            "team": t,
            "xpts": round(exp_pts[t], 2),
            "elo": round(stats[t]["elo"]),
            "form": round(stats[t]["form"], 3),
            "advances": rank < 2,
        }
        for rank, t in enumerate(sorted_teams)
    ]

    # Monte Carlo
    first_count, second_count = _simulate_group(teams, stats, pipeline)
    mc = sorted(
        [
            {
                "team": t,
                "first_pct": round(first_count[t] / SIMS, 4),
                "second_pct": round(second_count[t] / SIMS, 4),
                "qualify_pct": round((first_count[t] + second_count[t]) / SIMS, 4),
            }
            for t in teams
        ],
        key=lambda r: r["qualify_pct"],
        reverse=True,
    )

    return jsonify({
        "teams": teams,
        "matches": matches,
        "expected_table": expected_table,
        "monte_carlo": mc,
    })


@app.get("/health")
def health():
    return jsonify({"status": "ok", "teams_loaded": len(ALL_TEAMS)})


if __name__ == "__main__":
    app.run(debug=False, port=5001)
