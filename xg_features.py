"""
Feature engineering for the xG model.
All features derived from shot-level StatsBomb data.
"""
import pandas as pd

FEATURE_COLS = [
    "distance",
    "angle",
    "body_part_enc",
    "shot_type_enc",
    "technique_enc",
    "under_pressure",
    "n_defenders",
    "is_counter",
    "is_set_piece",
]

BODY_PART_MAP = {
    "Right Foot": 0,
    "Left Foot":  1,
    "Head":       2,
    "Chest":      3,
    "No Touch":   4,
    "Goalkeeper": 5,
}

SHOT_TYPE_MAP = {
    "Open Play":   0,
    "From Corner": 1,
    "Free Kick":   2,
    "Penalty":     3,
    "Kick Off":    4,
}

TECHNIQUE_MAP = {
    "Normal":          0,
    "Volley":          1,
    "Lob":             2,
    "Half Volley":     3,
    "Backheel":        4,
    "Overhead Kick":   5,
    "Diving Header":   6,
}

PENALTY_XG = 0.79


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build feature matrix from shots DataFrame."""
    dist_median = df["distance"].median() if "distance" in df else 20.0
    angle_median = df["angle"].median() if "angle" in df else 20.0

    out = pd.DataFrame(index=df.index)
    out["distance"]      = df["distance"].fillna(dist_median)
    out["angle"]         = df["angle"].fillna(angle_median)
    out["body_part_enc"] = df["body_part"].map(BODY_PART_MAP).fillna(0).astype(int)
    out["shot_type_enc"] = df["shot_type"].map(SHOT_TYPE_MAP).fillna(0).astype(int)
    out["technique_enc"] = df["technique"].map(TECHNIQUE_MAP).fillna(0).astype(int)
    out["under_pressure"] = df["under_pressure"].fillna(False).astype(int)
    out["n_defenders"]   = df["n_defenders"].fillna(0).astype(int)
    out["is_counter"]    = df["play_pattern"].str.contains(
        "Counter", case=False, na=False
    ).astype(int)
    out["is_set_piece"]  = df["play_pattern"].str.contains(
        r"Set Piece|Free Kick|Corner|Penalty", case=False, na=False
    ).astype(int)

    return out[FEATURE_COLS]


def predict_shot_xg(model, shot_dict: dict) -> float:
    """
    Predict xG for a single shot from a feature dict.

    shot_dict keys: x, y, distance, angle, body_part, shot_type,
                    technique, under_pressure, n_defenders, play_pattern
    """
    if shot_dict.get("shot_type") == "Penalty":
        return PENALTY_XG

    row = pd.DataFrame([{
        "distance":      shot_dict.get("distance", 20.0),
        "angle":         shot_dict.get("angle", 20.0),
        "body_part":     shot_dict.get("body_part", "Right Foot"),
        "shot_type":     shot_dict.get("shot_type", "Open Play"),
        "technique":     shot_dict.get("technique", "Normal"),
        "under_pressure": shot_dict.get("under_pressure", False),
        "n_defenders":   shot_dict.get("n_defenders", 0),
        "play_pattern":  shot_dict.get("play_pattern", "Regular Play"),
    }])

    X = build_features(row)
    return float(model.predict_proba(X)[0, 1])
