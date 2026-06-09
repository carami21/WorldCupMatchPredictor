"""
Train the logistic regression match outcome predictor.

Usage:
    python train.py

Outputs:
    models/model.joblib   — trained pipeline
    plots/confusion.png
    plots/feature_importance.png
"""
import warnings
warnings.filterwarnings("ignore")

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    ConfusionMatrixDisplay,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from fetch_data import fetch, OUT_PATH
from elo import build_elo
from features import build_features, FEATURE_COLS

LABEL_MAP = {0: "Away Win", 1: "Draw", 2: "Home Win"}
MODEL_PATH = Path("models/model.joblib")
CUTOFF_YEAR = 2015  # use last ~10 years for training


def load_data() -> pd.DataFrame:
    if not OUT_PATH.exists():
        fetch()
    df = pd.read_csv(OUT_PATH, parse_dates=["date"])
    return df


def main():
    print("=== World Cup Match Outcome Predictor — Training ===\n")

    df = load_data()
    print(f"Total matches in dataset: {len(df):,}")

    print("Building Elo ratings (replaying full history)...")
    _, df_elo = build_elo(df)

    # Filter to last ~10 years for training/eval
    df_recent = df_elo[df_elo["date"].dt.year >= CUTOFF_YEAR].copy()
    print(f"Matches from {CUTOFF_YEAR} onward: {len(df_recent):,}\n")

    print("Engineering features (this takes a moment)...")
    X, y = build_features(df_elo)

    # Only use recent rows for train/test
    recent_idx = df_elo[df_elo["date"].dt.year >= CUTOFF_YEAR].index
    X = X.loc[recent_idx]
    y = y.loc[recent_idx]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Train: {len(X_train):,} | Test: {len(X_test):,}\n")

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            max_iter=1000,
            C=1.0,
            random_state=42,
        )),
    ])
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Test accuracy: {acc:.3f}\n")
    print(classification_report(y_test, y_pred, target_names=list(LABEL_MAP.values())))

    # Confusion matrix
    Path("plots").mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    ConfusionMatrixDisplay.from_predictions(
        y_test, y_pred,
        display_labels=list(LABEL_MAP.values()),
        ax=ax, colorbar=False,
    )
    ax.set_title("Match Outcome Predictor — Confusion Matrix")
    plt.tight_layout()
    plt.savefig("plots/confusion.png", dpi=150)
    plt.close()
    print("Saved plots/confusion.png")

    # Feature importance (log-odds coefficients)
    coef = pipeline.named_steps["clf"].coef_
    mean_coef = np.abs(coef).mean(axis=0)
    fig, ax = plt.subplots(figsize=(8, 5))
    feat_df = pd.DataFrame({"feature": FEATURE_COLS, "importance": mean_coef})
    feat_df = feat_df.sort_values("importance", ascending=True)
    ax.barh(feat_df["feature"], feat_df["importance"], color="#4C9BE8")
    ax.set_title("Feature Importance (mean |coefficient|)")
    ax.set_xlabel("Importance")
    plt.tight_layout()
    plt.savefig("plots/feature_importance.png", dpi=150)
    plt.close()
    print("Saved plots/feature_importance.png")

    # Save model + full Elo df for prediction
    Path("models").mkdir(exist_ok=True)
    joblib.dump({"pipeline": pipeline, "df_elo": df_elo}, MODEL_PATH)
    print(f"\nModel saved to {MODEL_PATH}")


if __name__ == "__main__":
    main()
