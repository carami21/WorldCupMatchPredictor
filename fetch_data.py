"""
Download international football results from the public martj42 dataset.
Saves raw CSV to data/results.csv.
"""
import requests
import pandas as pd
from pathlib import Path

DATA_URL = (
    "https://raw.githubusercontent.com/martj42/international_results"
    "/master/results.csv"
)
OUT_PATH = Path("data/results.csv")


def fetch():
    print("Downloading international results dataset...")
    resp = requests.get(DATA_URL, timeout=30)
    resp.raise_for_status()
    OUT_PATH.write_bytes(resp.content)
    df = pd.read_csv(OUT_PATH)
    print(f"Saved {len(df):,} matches to {OUT_PATH}")
    return df


if __name__ == "__main__":
    fetch()
