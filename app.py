"""
Flask API for the World Cup Match Outcome Predictor + Expected Goals Model.

Match Predictor endpoints:
  GET  /api/teams           — list of all valid team names
  POST /api/predict         — predict a single match outcome
  POST /api/group           — simulate a full group stage

Expected Goals endpoints:
  GET  /api/xg/teams              — WC2022 teams with shot data
  GET  /api/xg/team/<team>        — team xG summary + top players
  GET  /api/xg/shots/<team>       — all shots for pitch heatmap
  POST /api/xg/predict-shot       — predict xG for a user-defined shot

Run:
  python app.py             (dev, port 5001)
"""
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from itertools import combinations
from pathlib import Path

import joblib
import math
import numpy as np
import pandas as pd
import sys

from features import FEATURE_COLS
from predict import _team_current_stats
from group_stage import _predict_match, _simulate_group, SIMS
from xg_features import build_features, predict_shot_xg, PENALTY_XG
from xg_data import GOAL_X, GOAL_Y_CENTER, GOAL_POST_LEFT, GOAL_POST_RIGHT

MODEL_PATH    = Path("models/model.joblib")
XG_MODEL_PATH = Path("models/xg_model.joblib")

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

# ── Load match predictor model ────────────────────────────────────────────────
if not MODEL_PATH.exists():
    print("ERROR: models/model.joblib not found. Run: python train.py")
    sys.exit(1)

bundle   = joblib.load(MODEL_PATH)
pipeline = bundle["pipeline"]
df_elo   = bundle["df_elo"]
ALL_TEAMS = sorted(
    set(df_elo["home_team"].unique()) | set(df_elo["away_team"].unique())
)

# ── Load xG model (optional — graceful if not yet trained) ───────────────────
xg_model    = None
df_wc2022   = None
XG_TEAMS    = []

if XG_MODEL_PATH.exists():
    xg_bundle  = joblib.load(XG_MODEL_PATH)
    xg_model   = xg_bundle["model"]
    df_wc2022  = xg_bundle["df_wc2022"]
    XG_TEAMS   = sorted(df_wc2022["team"].dropna().unique().tolist())
    print(f"xG model loaded — {len(XG_TEAMS)} WC2022 teams", flush=True)
else:
    print("xG model not found — run python xg_train.py to enable /api/xg/* endpoints",
          flush=True)


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
    return send_from_directory("static", "index.html")


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


# ── xG helpers ────────────────────────────────────────────────────────────────

def _xg_not_ready():
    return jsonify({
        "error": "xG model not trained yet. Run: python xg_train.py"
    }), 503


def _resolve_xg_team(name: str) -> str | None:
    if name in XG_TEAMS:
        return name
    lower = name.lower()
    matches = [t for t in XG_TEAMS if t.lower() == lower]
    return matches[0] if matches else None


# ── xG routes ─────────────────────────────────────────────────────────────────

@app.get("/api/xg/teams")
def xg_teams():
    """List all WC2022 teams with shot data in the xG model."""
    if xg_model is None:
        return _xg_not_ready()
    return jsonify({"teams": XG_TEAMS, "count": len(XG_TEAMS)})


@app.get("/api/xg/team/<team_name>")
def xg_team(team_name: str):
    """
    Return xG summary for a WC2022 team.

    Response:
    {
      "team": "Argentina",
      "total_shots": 64,
      "total_xg": 11.4,
      "actual_goals": 15,
      "xg_overperformance": 3.6,
      "shots_per_game": 16.0,
      "xg_per_shot": 0.178,
      "top_players": [
        { "player": "Lionel Messi", "shots": 14, "goals": 7, "xg": 4.2, "xg_per_shot": 0.30 }
      ]
    }
    """
    if xg_model is None:
        return _xg_not_ready()

    team = _resolve_xg_team(team_name)
    if not team:
        close = [t for t in XG_TEAMS if team_name.lower() in t.lower()][:5]
        return jsonify({"error": f"Team '{team_name}' not found.", "suggestions": close}), 404

    df = df_wc2022[df_wc2022["team"] == team].copy()

    n_matches = df["match_id"].nunique()
    total_shots = len(df)
    total_xg    = float(df["xg"].sum())
    actual_goals = int(df["is_goal"].sum())

    # Per-player breakdown
    player_stats = (
        df.groupby("player")
        .agg(shots=("xg", "count"), goals=("is_goal", "sum"), xg=("xg", "sum"))
        .reset_index()
        .sort_values("xg", ascending=False)
    )
    top_players = [
        {
            "player":     row["player"],
            "shots":      int(row["shots"]),
            "goals":      int(row["goals"]),
            "xg":         round(float(row["xg"]), 3),
            "xg_per_shot": round(float(row["xg"]) / row["shots"], 3) if row["shots"] else 0,
        }
        for _, row in player_stats.head(10).iterrows()
        if row["player"]
    ]

    return jsonify({
        "team":                team,
        "matches_played":      n_matches,
        "total_shots":         total_shots,
        "total_xg":            round(total_xg, 2),
        "actual_goals":        actual_goals,
        "xg_overperformance":  round(actual_goals - total_xg, 2),
        "shots_per_game":      round(total_shots / n_matches, 1) if n_matches else 0,
        "xg_per_shot":         round(total_xg / total_shots, 3) if total_shots else 0,
        "top_players":         top_players,
    })


@app.get("/api/xg/shots/<team_name>")
def xg_shots(team_name: str):
    """
    Return all shots for a WC2022 team — used to render pitch heatmap.

    Response:
    {
      "team": "Argentina",
      "shots": [
        { "x": 105.3, "y": 38.1, "xg": 0.31, "is_goal": 1,
          "player": "Lionel Messi", "minute": 23, "shot_type": "Open Play" }
      ]
    }
    """
    if xg_model is None:
        return _xg_not_ready()

    team = _resolve_xg_team(team_name)
    if not team:
        close = [t for t in XG_TEAMS if team_name.lower() in t.lower()][:5]
        return jsonify({"error": f"Team '{team_name}' not found.", "suggestions": close}), 404

    df = df_wc2022[df_wc2022["team"] == team]

    shots = [
        {
            "x":         round(float(row["x"]), 1),
            "y":         round(float(row["y"]), 1),
            "xg":        round(float(row["xg"]), 3),
            "is_goal":   int(row["is_goal"]),
            "player":    str(row["player"]),
            "minute":    int(row["minute"]),
            "shot_type": str(row["shot_type"]),
            "body_part": str(row["body_part"]),
            "distance":  round(float(row["distance"]), 1),
            "angle":     round(float(row["angle"]), 1),
        }
        for _, row in df.iterrows()
    ]

    return jsonify({"team": team, "shots": shots, "count": len(shots)})


@app.post("/api/xg/predict-shot")
def xg_predict_shot():
    """
    Predict xG for a user-defined shot.

    Body:
    {
      "x": 105.0, "y": 40.0,
      "body_part": "Right Foot",
      "shot_type": "Open Play",
      "technique": "Normal",
      "under_pressure": false,
      "n_defenders": 1,
      "play_pattern": "Regular Play"
    }

    Response:
    {
      "xg": 0.32,
      "distance": 15.0,
      "angle": 28.5,
      "quality": "Good chance",
      "description": "Right-footed shot 15m from goal at 28° angle"
    }
    """
    if xg_model is None:
        return _xg_not_ready()

    body = request.get_json(silent=True) or {}
    x = float(body.get("x", 105.0))
    y = float(body.get("y", 40.0))

    dx = GOAL_X - x
    distance = math.sqrt(dx ** 2 + (GOAL_Y_CENTER - y) ** 2)
    a1 = math.atan2(GOAL_POST_RIGHT - y, dx)
    a2 = math.atan2(GOAL_POST_LEFT  - y, dx)
    angle = abs(math.degrees(a1 - a2))

    shot_dict = {
        "distance":      distance,
        "angle":         angle,
        "body_part":     body.get("body_part", "Right Foot"),
        "shot_type":     body.get("shot_type", "Open Play"),
        "technique":     body.get("technique", "Normal"),
        "under_pressure": bool(body.get("under_pressure", False)),
        "n_defenders":   int(body.get("n_defenders", 0)),
        "play_pattern":  body.get("play_pattern", "Regular Play"),
    }

    xg = predict_shot_xg(xg_model, shot_dict)

    if xg >= 0.40:
        quality = "Big chance"
    elif xg >= 0.20:
        quality = "Good chance"
    elif xg >= 0.10:
        quality = "Half chance"
    else:
        quality = "Low probability"

    bp   = shot_dict["body_part"].lower()
    desc = (
        f"{bp.capitalize()} shot from {round(distance, 1)}m at "
        f"{round(angle, 1)}° angle"
        + (" under pressure" if shot_dict["under_pressure"] else "")
    )

    return jsonify({
        "xg":         round(xg, 4),
        "distance":   round(distance, 2),
        "angle":      round(angle, 2),
        "quality":    quality,
        "description": desc,
        "inputs":     shot_dict,
    })


@app.get("/api/xg/danger-zones")
def xg_danger_zones():
    """
    Return model-derived xG for a grid across the attacking half of the pitch.
    This is pure model output — no historical data required.

    Query params (all optional):
      body_part:      "Right Foot" | "Left Foot" | "Head"  (default: Right Foot)
      shot_type:      "Open Play" | "Free Kick" | "Penalty" (default: Open Play)
      under_pressure: "true" | "false"                      (default: false)
      technique:      "Normal" | "Volley" | "Head" | ...    (default: Normal)

    Response:
    {
      "grid": [[xg, ...], ...],  // grid[row][col], row=y axis, col=x axis
      "x_vals": [61, 62, ...],   // pitch x coords (StatsBomb: goal at x=120)
      "y_vals": [0, 2, ...],     // pitch y coords
      "cols": 59,
      "rows": 41,
      "params": { "body_part": "Right Foot", ... }
    }
    """
    if xg_model is None:
        return _xg_not_ready()

    body_part     = request.args.get("body_part", "Right Foot")
    shot_type_p   = request.args.get("shot_type", "Open Play")
    under_pressure = request.args.get("under_pressure", "false").lower() == "true"
    technique     = request.args.get("technique", "Normal")

    # Grid: attacking half x=61→119, y=0→80
    x_vals = list(range(61, 120))   # 59 columns
    y_vals = list(range(0, 81, 2))  # 41 rows (step 2 for performance)

    # Build all grid points at once — vectorized geometry
    xs, ys = np.meshgrid(x_vals, y_vals)  # shape (41, 59)
    xs_flat = xs.ravel().astype(float)
    ys_flat = ys.ravel().astype(float)

    dx       = GOAL_X - xs_flat
    distance = np.sqrt(dx ** 2 + (GOAL_Y_CENTER - ys_flat) ** 2)
    a1       = np.arctan2(GOAL_POST_RIGHT - ys_flat, dx)
    a2       = np.arctan2(GOAL_POST_LEFT  - ys_flat, dx)
    angle    = np.abs(np.degrees(a1 - a2))

    df_grid = pd.DataFrame({
        "distance":      distance,
        "angle":         angle,
        "body_part":     body_part,
        "shot_type":     shot_type_p,
        "technique":     technique,
        "under_pressure": under_pressure,
        "n_defenders":   0,
        "play_pattern":  "Regular Play",
    })

    X_grid = build_features(df_grid)
    proba  = xg_model.predict_proba(X_grid)[:, 1]

    if shot_type_p == "Penalty":
        proba[:] = PENALTY_XG

    grid = proba.reshape(len(y_vals), len(x_vals))

    return jsonify({
        "grid":   [[round(float(v), 4) for v in row] for row in grid],
        "x_vals": x_vals,
        "y_vals": y_vals,
        "cols":   len(x_vals),
        "rows":   len(y_vals),
        "params": {
            "body_part":      body_part,
            "shot_type":      shot_type_p,
            "under_pressure": under_pressure,
            "technique":      technique,
        },
    })


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "teams_loaded": len(ALL_TEAMS),
        "xg_ready": xg_model is not None,
        "xg_teams": len(XG_TEAMS),
    })


if __name__ == "__main__":
    app.run(debug=False, port=5001)
