"""
Train XGBoost xG model on StatsBomb open data shot events.

Usage:
    python xg_train.py            # use cached data if present
    python xg_train.py --refresh  # force re-fetch from StatsBomb
"""
import argparse
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from xg_data import load_training_shots, load_wc2022_shots
from xg_features import FEATURE_COLS, PENALTY_XG, build_features

MODEL_PATH = Path("models/xg_model.joblib")


def train(force_refresh: bool = False) -> None:
    # ── Training data ─────────────────────────────────────────────────────────
    print("Loading training shot data…")
    df = load_training_shots(force_refresh=force_refresh)
    print(f"  {len(df):,} shots | goal rate: {df['is_goal'].mean():.3f}")

    # Exclude penalties — fixed xG override at inference time
    df_train = df[df["shot_type"] != "Penalty"].copy()
    print(f"  {len(df_train):,} shots after removing penalties")

    X = build_features(df_train)
    y = df_train["is_goal"].astype(int).values

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── Model ─────────────────────────────────────────────────────────────────
    print("Training XGBoost…")
    neg, pos = (y_tr == 0).sum(), (y_tr == 1).sum()
    model = XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=neg / pos,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )
    model.fit(
        X_tr, y_tr,
        eval_set=[(X_te, y_te)],
        verbose=False,
    )

    # ── Evaluation ────────────────────────────────────────────────────────────
    proba = model.predict_proba(X_te)[:, 1]
    auc    = roc_auc_score(y_te, proba)
    ap     = average_precision_score(y_te, proba)
    brier  = brier_score_loss(y_te, proba)

    print(f"\n  AUC-ROC:         {auc:.4f}")
    print(f"  Avg Precision:   {ap:.4f}")
    print(f"  Brier Score:     {brier:.4f}")

    print("\n  Feature importances:")
    for feat, imp in sorted(
        zip(FEATURE_COLS, model.feature_importances_), key=lambda r: -r[1]
    ):
        bar = "█" * int(imp * 80)
        print(f"    {feat:<25} {bar} {imp:.4f}")

    # ── Score WC2022 shots ────────────────────────────────────────────────────
    print("\nLoading WC2022 shots for team/player analysis…")
    df_wc = load_wc2022_shots(force_refresh=force_refresh).copy()

    X_wc = build_features(df_wc)
    df_wc["xg"] = model.predict_proba(X_wc)[:, 1]
    # Penalty override
    df_wc.loc[df_wc["shot_type"] == "Penalty", "xg"] = PENALTY_XG

    print(f"  WC2022 teams ({df_wc['team'].nunique()}): {sorted(df_wc['team'].unique())}")
    print(f"  Total xG: {df_wc['xg'].sum():.1f}  |  Actual goals: {df_wc['is_goal'].sum()}")

    # ── Save ──────────────────────────────────────────────────────────────────
    MODEL_PATH.parent.mkdir(exist_ok=True)
    bundle = {
        "model":        model,
        "feature_cols": FEATURE_COLS,
        "df_wc2022":    df_wc,
        "metrics": {
            "auc":           round(auc, 4),
            "avg_precision": round(ap, 4),
            "brier":         round(brier, 4),
            "n_train":       len(X_tr),
            "n_test":        len(X_te),
        },
    }
    joblib.dump(bundle, MODEL_PATH)
    print(f"\nSaved xG bundle → {MODEL_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true",
                        help="Force re-fetch shot data from StatsBomb")
    args = parser.parse_args()
    train(force_refresh=args.refresh)
