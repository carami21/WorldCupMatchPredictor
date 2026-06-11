# World Cup Match Outcome Predictor

Predict the winner of any international football matchup using logistic regression trained on 49,000+ historical results. Built for the FIFA World Cup 2026.

## Features

- **Match predictor** — input any two national teams, get win/draw/loss probabilities
- **Group stage simulator** — simulate a full 4-team group with an expected points table and Monte Carlo qualification odds (10,000 runs)
- **Custom Elo engine** — replays the full international match history to compute live ratings, with tournament-tiered K-factors
- **60% test accuracy** on held-out matches (2015–present), 3-class classification

## Quickstart

```bash
git clone https://github.com/carami21/WorldCupMatchPredictor
cd WorldCupMatchPredictor
pip install -r requirements.txt

# Download data and train the model (one-time setup, ~30 seconds)
python fetch_data.py
python train.py
```

## Running the Web App

The project includes a full web frontend with a 3D soccer ball, realistic pitch, and interactive prediction UI.

```bash
# 1. Make sure the model is trained first
python fetch_data.py
python train.py

# 2. Start the Flask server
python app.py

# 3. Open in your browser
#    http://localhost:5001
```

The web app features:
- **3D soccer ball** in the hero section that rolls as you scroll
- **Realistic soccer pitch** background on the prediction form
- **Match predictor** — search and select two teams, get probability bars and stats
- **Group stage simulator** — pick 4 teams, see standings and Monte Carlo qualification odds

### Testing the API directly

```bash
# Health check
curl http://localhost:5001/health

# List all teams
curl http://localhost:5001/api/teams

# Predict a match
curl -X POST http://localhost:5001/api/predict \
  -H "Content-Type: application/json" \
  -d '{"home": "Brazil", "away": "Argentina", "neutral": true}'

# Simulate a group stage
curl -X POST http://localhost:5001/api/group \
  -H "Content-Type: application/json" \
  -d '{"teams": ["Brazil", "Argentina", "Mexico", "United States"]}'
```

## Usage

### Predict a match (CLI)

```bash
python predict.py "Brazil" "Argentina"
python predict.py "Spain" "Germany"
python predict.py "Portugal" "France" --home-ground   # treat first team as home side
python predict.py --list-teams                        # print all valid team names
```

**Example output:**
```
==========================================================
  Spain  vs  Germany
  Neutral venue
==========================================================
  Elo   → Spain: 2081  |  Germany: 1937
  Form  → Spain: 70%  |  Germany: 100%
  xG±   → Spain: 1.8–0.8  |  Germany: 3.6–1.0
----------------------------------------------------------
  Spain                █████████████████░░░░░░░░░░░  60.6%
  Draw                 ███████░░░░░░░░░░░░░░░░░░░░░  23.7%
  Germany              ████░░░░░░░░░░░░░░░░░░░░░░░░  15.6%
==========================================================
  Prediction: Spain win  (60.6% confidence)
```

### Simulate a group stage

```bash
python group_stage.py "Brazil" "Argentina" "Mexico" "United States"
python group_stage.py "Spain" "Germany" "Japan" "Costa Rica"
```

**Example output:**
```
  Monte Carlo Results  (10,000 simulations)
────────────────────────────────────────────────
  Team                      1st     2nd   Qualify
────────────────────────────────────────────────
  Argentina                60%    24%  █████████████████░░░    83%
  Brazil                   19%    31%  ██████████░░░░░░░░░░    50%
  Mexico                   15%    28%  █████████░░░░░░░░░░░    43%
  United States             7%    17%  █████░░░░░░░░░░░░░░░    24%
```

## How It Works

### Data
49,450 international results from 1872–present via the [martj42/international_results](https://github.com/martj42/international_results) public dataset. Downloaded fresh each run with `fetch_data.py`.

### Elo Ratings
All teams start at 1500. Ratings are updated after every match using a standard Elo formula with tournament-weighted K-factors:

| Tournament type | K-factor |
|---|---|
| FIFA World Cup | 60 |
| Continental championships (Euros, Copa América, etc.) | 50 |
| World Cup qualifiers | 40 |
| Other competitive | 30 |
| Friendlies | 20 |

### Features
Built at kick-off with no data leakage:

| Feature | Description |
|---|---|
| `elo_diff` | Home Elo minus away Elo |
| `home_form` / `away_form` | Win rate in last 5 matches |
| `home_goals_avg` / `away_goals_avg` | Avg goals scored, last 5 |
| `home_goals_conceded_avg` / `away_goals_conceded_avg` | Avg goals conceded, last 5 |
| `is_neutral` | 1 if neutral venue (always 1 for World Cup) |

### Model
`sklearn` logistic regression with `StandardScaler`. Trained on ~11,000 matches from 2015 onward (80/20 train/test split). Run `python train.py` to retrain and regenerate evaluation plots.

## Stack
`requests` · `pandas` · `scikit-learn` · `seaborn` · `matplotlib` · `numpy` · `joblib`

## Project Structure
```
WorldCupMatchPredictor/
├── app.py             # Flask API + static file server
├── fetch_data.py      # Download the dataset
├── elo.py             # Custom Elo rating engine
├── features.py        # Vectorized feature engineering
├── train.py           # Model training + evaluation plots
├── predict.py         # CLI match predictor
├── group_stage.py     # Group stage simulator (Monte Carlo)
├── requirements.txt
└── static/
    ├── index.html     # Web frontend (single-page app)
    ├── styles.css     # Styling (dark theme, pitch, glassmorphism)
    └── app.js         # Three.js 3D ball, scroll animation, API calls
```

> Data, models, and plots are excluded from the repo — regenerated locally by running `fetch_data.py` and `train.py`.
